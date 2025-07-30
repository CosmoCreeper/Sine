using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Diagnostics;
using System.Text.Json;
using System.Linq;
using Spectre.Console;

namespace SineInstaller
{
    public class Program
    {
        private static readonly HttpClient httpClient = new HttpClient();
        private static readonly string platform = GetPlatform();
        private static readonly string homeDir = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        private static readonly bool isLinux = platform == "linux";
        private static readonly bool isCosine = false;
        private static readonly string sineBranch = isCosine ? "cosine" : "main";
        private static readonly string fontFileName = "Sub-Zero.flf";
        private static readonly string fontFolderPath = "Fonts";
        private static readonly string fullFontPath = Path.Combine(AppContext.BaseDirectory, fontFolderPath, fontFileName);
        [DllImport("libc.so.6")]
        private static extern uint getuid();

        public static async Task Main(string[] args)
        {
            try
            {
                await MainAsync();
            }
            catch (Exception ex)
            {
                AnsiConsole.Markup($"\nERROR:[red]An unexpected error occurred: {ex.Message}[/]");
                Exit();
            }
        }

        private static async Task MainAsync()
        {
            AnsiConsole.Markup("==> Sine Installer -- v2 <==\n");


            FigletFont figletFont = FigletFont.Load(fullFontPath);
            AnsiConsole.Write(
                new FigletText(figletFont, "Sine")
                .Color(Color.White)
            );

            AnsiConsole.Write(
                new Align(
                    new Markup("v2"),
                          HorizontalAlignment.Center,
                          VerticalAlignment.Middle
                )
            );

            if (!IsSupportedPlatform())
            {
                AnsiConsole.Markup($"[red]ERROR:Sorry, you don't use a supported platform for the auto-installer.\nPlease consider manually installing or posting about it on our github repository.[/]");
                Exit();
                return;
            }

            var browser = GetBrowser();
            var browserLocation = GetBrowserLocation(browser);

            string profileDir;
            string? tempUsername = null;

            if (isLinux)
            {
                // Note: C# doesn't have direct equivalent to process.getuid(),
                // so we'll skip the root check for this translation
                // tempUsername = PromptUsername();
                tempUsername = Environment.UserName;
                if (IsRunningAsSudoLinux()){
                    tempUsername = PromptUsername();
                }
            }

            try
            {
                profileDir = GetProfileDir(browser.Split(' ')[0], tempUsername!);
                if (!Directory.Exists(profileDir))
                {
                    throw new DirectoryNotFoundException($"Profile directory not found at {profileDir}.");
                }
            }
            catch (Exception ex)
            {
                AnsiConsole.Markup($"[red]ERROR: Profile directory error: {ex.Message}[/]");
                return;
            }

            var profiles = await GetProfiles(profileDir);
            if (profiles.Count == 0)
            {
                AnsiConsole.Markup($"[red]No profiles found in the profile directory.[/]");
                return;
            }

            var selectedProfile = PromptProfileSelection(profiles);

            if (File.Exists(Path.Combine(selectedProfile, "chrome/JS/sine.uc.mjs")))
            {
                var shouldInstall = AnsiConsole.Ask<string>("\n[darkorange3_1]Do you wish to remove Sine from the selected profile (y/N)?[/]", "");
                if (shouldInstall.ToLower().Contains("y"))
                {
                    UninstallSine(selectedProfile);
                    AnsiConsole.WriteLine();
                    return;
                }
            }

            await InstallFxAutoconfig(selectedProfile, browserLocation);
            await InstallSine(selectedProfile);
            await SetSinePref(selectedProfile);

            ClearStartupCache(browser, selectedProfile);

            AnsiConsole.WriteLine();
            Exit();
        }

        static bool IsRunningAsSudoLinux()
        {
            return getuid() == 0;
        }

        private static string GetPlatform()
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                return "win32";
            if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
                return "darwin";
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
                return "linux";
            return "unknown";
        }

        private static bool IsSupportedPlatform()
        {
            return platform == "win32" || platform == "darwin" || platform == "linux";
        }

        private static void Exit()
        {
            Console.Write("Enter anything to exit: ");
            Console.ReadLine();
            Environment.Exit(1);
        }

        private static string PromptSelect(string message, Dictionary<string, string> choices)
        {
            AnsiConsole.WriteLine(message);
            var choicesList = choices.ToList();

            for (int i = 0; i < choicesList.Count; i++)
            {
                AnsiConsole.WriteLine($"{i + 1}. {choicesList[i].Key}");
            }

            while (true)
            {
                Console.Write("Enter your choice (1-" + choicesList.Count + "): ");
                if (int.TryParse(Console.ReadLine(), out int choice) &&
                    choice >= 1 && choice <= choicesList.Count)
                {
                    return choicesList[choice - 1].Value;
                }
                AnsiConsole.WriteLine("Invalid choice. Please try again.");
            }
        }

        private static string ManualLocationPrompt(string promptFor)
        {
            string location = "";
            bool notFirstLoop = false;

            while (!Directory.Exists(location) && !File.Exists(location))
            {
                if (notFirstLoop)
                {
                    AnsiConsole.Markup($"\n[darkorange3_1]You can't input non-existent paths.[/]");
                }
                else
                {
                    notFirstLoop = true;
                }

                location = AnsiConsole.Ask<string>($"[green]Enter the location of {promptFor} on your system:[/]");
            }

            return location;
        }

        private static string? AutoDetectPath(Dictionary<string, Dictionary<string, string[]>> possibleLocations,
                                             string browser, bool isProfile, string? tempUsername = null)
        {
            if (!possibleLocations.ContainsKey(browser))
            {
                AnsiConsole.Markup($"[red]\nWe do not currently support automatic location detection of {browser}{(isProfile ? "'s profiles folder" : "")}.[/]");
                AnsiConsole.Markup($"[blue]If you believe we should support this browser, you may post an issue on our AnsiConsole page.[/]");
                return null;
            }

            var browserLocations = possibleLocations[browser];
            if (!browserLocations.ContainsKey(platform))
            {
                AnsiConsole.Markup($"[red]\nWe do not currently support automatic location detection of {browser}{(isProfile ? "'s profiles folder" : "")} on {platform}.");
                AnsiConsole.Markup($"[green]If you believe we should support this platform, you may post an issue on our github page.[/]");
                return null;
            }

            foreach (var location in browserLocations[platform])
            {
                string fullPath = location;

                if (isProfile)
                {
                    switch (platform)
                    {
                        case "win32":
                            fullPath = Path.Combine(homeDir, "AppData", "Roaming", location, "Profiles");
                            break;
                        case "darwin":
                            fullPath = Path.Combine(homeDir, "Library", "Application Support", location, "Profiles");
                            break;
                        case "linux":
                            fullPath = Path.Combine("/home", tempUsername ?? Environment.UserName, location);
                            break;
                    }
                }

                if (Directory.Exists(fullPath))
                {
                    if (!isProfile) AnsiConsole.WriteLine();
                    AnsiConsole.Markup($"[green]Successfully found the {(isProfile ? "profiles folder" : "installation directory")} for {browser} on {platform}.[/]");
                    if (isProfile) AnsiConsole.WriteLine();
                    return fullPath;
                }
            }

            AnsiConsole.Markup($"\n[red]We could not find {browser}{(isProfile ? "'s profiles folder" : "")} on your system.[/]");
            return null;
        }

        private static string GetProfileDir(string browser, string tempUsername)
        {
            var possibleLocations = new Dictionary<string, Dictionary<string, string[]>>
            {
                ["Firefox"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { "Mozilla\\Firefox" },
                    ["darwin"] = new[] { "Firefox" },
                    ["linux"] = new[] { ".mozilla/firefox" }
                },
                ["Floorp"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { "Floorp" },
                    ["darwin"] = new[] { "Floorp" },
                    ["linux"] = new[] { ".floorp" }
                },
                ["Zen"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { "zen" },
                    ["darwin"] = new[] { "Zen" },
                    ["linux"] = new[] { ".zen" }
                },
                ["Mullvad"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { "Mullvad\\MullvadBrowser" },
                    ["darwin"] = new[] { "MullvadBrowser" },
                    ["linux"] = new[] { ".mullvad-browser" }
                },
                ["Waterfox"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { "Waterfox" },
                    ["darwin"] = new[] { "Waterfox" },
                    ["linux"] = new[] { ".waterfox" }
                }
            };

            var location = AutoDetectPath(possibleLocations, browser, true, tempUsername);
            if (location != null) return location;

            AnsiConsole.Markup($"\n[darkorange3_1]Unable to automatically detect the location of {browser}'s profile folder, proceeding with manual prompt.[/]");
            return ManualLocationPrompt($"{browser}'s profile folder");
        }

        private static async Task<List<ProfileInfo>> GetProfiles(string profileDir)
        {
            var iniPath = Path.Combine(profileDir, isLinux ? "" : "..", "profiles.ini");
            var profiles = new List<ProfileInfo>();

            try
            {
                var iniContent = await File.ReadAllTextAsync(iniPath);
                var lines = iniContent.Split('\n');
                Dictionary<string, string>? currentProfile = null;

                foreach (var line in lines)
                {
                    var trimmedLine = line.Trim();

                    if (trimmedLine.StartsWith("[Profile"))
                    {
                        if (currentProfile != null)
                        {
                            AddProfileIfValid(profiles, currentProfile, profileDir);
                        }
                        currentProfile = new Dictionary<string, string>();
                    }
                    else if (currentProfile != null && trimmedLine.Contains("="))
                    {
                        var parts = trimmedLine.Split('=', 2);
                        if (parts.Length == 2)
                        {
                            currentProfile[parts[0].Trim()] = parts[1].Trim();
                        }
                    }
                }

                if (currentProfile != null)
                {
                    AddProfileIfValid(profiles, currentProfile, profileDir);
                }
            }
            catch (Exception ex)
            {
                AnsiConsole.WriteLine($"Error reading profiles.ini: {ex.Message}");
            }

            return profiles;
        }

        private static void AddProfileIfValid(List<ProfileInfo> profiles, Dictionary<string, string> profileData, string profileDir)
        {
            if (profileData.ContainsKey("Path"))
            {
                var profileName = Path.GetFileName(profileData["Path"]);

                profiles.Add(new ProfileInfo
                {
                    Name = profileName,
                    Path = Path.Combine(profileDir, Path.GetFileName(profileData["Path"]))
                });
            }
        }

        private static string PromptUsername()
        {
            return AnsiConsole.Ask<string>("[green]Whatsystem user are you currently on? (So /home/USERNAME/):[/]");
        }

        private static async Task DownloadFile(string url, string destinationPath)
        {
            try
            {
                var response = await httpClient.GetAsync(url);
                response.EnsureSuccessStatusCode();

                Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);

                using var fileStream = File.Create(destinationPath);
                await response.Content.CopyToAsync(fileStream);
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to download {url}: {ex.Message}");
            }
        }

        private static async Task SetupFileDownload(string existingPath, string file, string url)
        {
            var dest = Path.Combine(existingPath, file);
            try
            {
                await DownloadFile(url, dest);
                AnsiConsole.WriteLine($"Installed {file}");
            }
            catch (Exception ex)
            {
                AnsiConsole.Markup($"[red]Failed to install {file}: {ex.Message}[/]");
                if (ex.Message.Contains("Access to the path")) {
                    AnsiConsole.WriteLine("");
                    AnsiConsole.Markup($"[blue]If access was denied, try running the script with super user rights.[/]");
                    AnsiConsole.WriteLine("");
                }
                Exit();
            }
        }

        private static async Task InstallFxAutoconfig(string profilePath, string programPath)
        {
            AnsiConsole.WriteLine("\nInstalling Fx-AutoConfig...\n");

            var programFilesToInstall = new[]
            {
                "config.js",
                "defaults/pref/config-prefs.js"
            };

            var filesToInstall = new[]
            {
                "CSS/agent_style.uc.css",
                "CSS/author_style.uc.css",
                "JS/test.uc.js",
                "JS/userChrome_ag_css.sys.mjs",
                "JS/userChrome_au_css.uc.js",
                "resources/userChrome.ag.css",
                "resources/userChrome.au.css",
                "utils/boot.sys.mjs",
                "utils/chrome.manifest",
                "utils/fs.sys.mjs",
                "utils/module_loader.mjs",
                "utils/uc_api.sys.mjs",
                "utils/utils.sys.mjs"
            };

            foreach (var file in programFilesToInstall)
            {
                var url = $"https://raw.githubusercontent.com/MrOtherGuy/fx-autoconfig/master/program/{file}";
                try
                {
                    await SetupFileDownload(programPath, file, url);
                }
                catch (Exception ex)
                {
                    AnsiConsole.WriteLine(ex.Message);
                }
            }

            foreach (var file in filesToInstall)
            {
                // Temporarily use outdated fx-autoconfig.
                var url = $"https://raw.githubusercontent.com/MrOtherGuy/fx-autoconfig/f1f61958491c18e690bed8e04e89dd3a8e4a6c4d/profile/chrome/{file}";
                try
                {
                    await SetupFileDownload(profilePath, "chrome/" + file, url);
                }
                catch (Exception ex)
                {
                    AnsiConsole.WriteLine(ex.Message);
                }
            }

            AnsiConsole.WriteLine("\nFx-AutoConfig has been installed successfully!");
        }

        private static async Task InstallSine(string profilePath)
        {
            AnsiConsole.WriteLine("\nInstalling Sine...");

            var zipURL = $"https://raw.githubusercontent.com/CosmoCreeper/Sine/{sineBranch}/deployment/engine.zip";
            try
            {
                await DownloadAndExtractZipWithProgress(zipURL, Path.Combine(profilePath, "chrome", "JS"));
            }
            catch (Exception ex)
            {
                AnsiConsole.WriteLine(ex.Message);
            }

            AnsiConsole.WriteLine("\nSine has been installed successfully!");
        }

        private static void UninstallSine(string profilePath)
        {
            AnsiConsole.WriteLine("\nUninstalling Sine...");

            var sinePath = Path.Combine(profilePath, "chrome", "JS", "sine.uc.mjs");
            if (!File.Exists(sinePath))
            {
                AnsiConsole.WriteLine("Sine is not installed in the specified profile.");
                return;
            }
            else
            {
                File.Delete(sinePath);
                AnsiConsole.WriteLine("Successfully removed the control script.");
            }

            var enginePath = Path.Combine(profilePath, "chrome", "JS", "engine");
            if (Directory.Exists(enginePath))
            {
                try
                {
                    Directory.Delete(sinePath, true);
                    AnsiConsole.WriteLine("Successfully removed the Sine engine.");
                }
                catch (Exception ex)
                {
                    AnsiConsole.WriteLine($"Failed to uninstall Sine: {ex.Message}");
                }
            }
        }

        private static async Task<string> GetVersionOnlyAsync()
        {
            try
            {
                var url = $"https://raw.githubusercontent.com/CosmoCreeper/Sine/{sineBranch}/deployment/engine.json";

                HttpResponseMessage response = await httpClient.GetAsync(url);
                response.EnsureSuccessStatusCode();

                string jsonString = await response.Content.ReadAsStringAsync();
                using JsonDocument doc = JsonDocument.Parse(jsonString);

                if (doc.RootElement.TryGetProperty("version", out JsonElement versionElement))
                {
                    return versionElement.GetString()!;
                }

                return "";
            }
            catch (HttpRequestException e)
            {
                Console.WriteLine($"Request error: {e.Message}");
                throw;
            }
        }

        private static async Task SetSinePref(string profilePath)
        {
            var prefsPath = Path.Combine(profilePath, "prefs.js");

            var updatedAt = $"user_pref(\"sine.updated-at\", \"{DateTime.Now.ToString("yyyy-MM-dd HH:mm")}\");";
            if (!File.ReadAllText(prefsPath).Contains("user_pref(\"sine.updated-at\""))
            {
                File.AppendAllText(prefsPath, updatedAt + Environment.NewLine);
            }

            var version = await GetVersionOnlyAsync();

            var versionPref = $"user_pref(\"sine.version\", \"{version}\");";
            if (!File.ReadAllText(prefsPath).Contains("user_pref(\"sine.version\""))
            {
                File.AppendAllText(prefsPath, versionPref + Environment.NewLine);
            }

            var latestVersionPref = $"user_pref(\"sine.latest-version\", \"{version}\");";
            if (!File.ReadAllText(prefsPath).Contains("user_pref(\"sine.latest-version\""))
            {
                File.AppendAllText(prefsPath, latestVersionPref + Environment.NewLine);
            }
        }

        private static string GetBrowser()
        {
            var browsers = new Dictionary<string, string>
            {
                ["Firefox"] = "Firefox",
                ["Zen"] = "Zen",
                ["Floorp"] = "Floorp",
                ["Mullvad"] = "Mullvad",
                ["Waterfox"] = "Waterfox"
            };

            // Main browser selection prompt
            var browserSelectionPrompt = new SelectionPrompt<string>()
            .Title("[bold green]What browser do you wish to install Sine on?[/]")
            .PageSize(8) // Show up to 8 options at a time
            .MoreChoicesText("[grey](Move up and down to reveal more choices)[/]")
            .AddChoices(browsers.Keys); // Add the display names for the browsers

            var selectedBrowserKey = AnsiConsole.Prompt(browserSelectionPrompt);
            var browser = browsers[selectedBrowserKey]; // Get the actual value associated with the selected key

            // No need for AnsiConsole.WriteLine() here, Spectre.Console handles spacing for prompts

            string version = "";

            // Version selection based on browser
            if (browser == "Firefox")
            {
                var versions = new Dictionary<string, string>
                {
                    ["Stable"] = "Stable",
                    ["Developer Edition"] = "Developer Edition",
                    ["Nightly"] = "Nightly"
                };

                var firefoxVersionPrompt = new SelectionPrompt<string>()
                .Title($"[bold green]What version of [blue]{browser}[/] do you use ([grey]stable will work with beta[/])?[/]")
                .PageSize(5)
                .AddChoices(versions.Keys);

                var selectedVersionKey = AnsiConsole.Prompt(firefoxVersionPrompt);
                version = versions[selectedVersionKey];
            }
            else if (browser == "Zen")
            {
                var versions = new Dictionary<string, string>
                {
                    ["Beta"] = "Beta",
                    ["Twilight"] = "Twilight"
                };

                var zenVersionPrompt = new SelectionPrompt<string>()
                .Title($"[bold green]What version of [blue]{browser}[/] do you use ([grey]beta is default[/])?[/]")
                .PageSize(5)
                .AddChoices(versions.Keys);

                var selectedVersionKey = AnsiConsole.Prompt(zenVersionPrompt);
                version = versions[selectedVersionKey];
            }
            else if (browser == "Mullvad")
            {
                var versions = new Dictionary<string, string>
                {
                    ["Stable"] = "Stable",
                    ["Alpha"] = "Alpha"
                };

                var mullvadVersionPrompt = new SelectionPrompt<string>()
                .Title($"[bold green]What version of [blue]{browser}[/] do you use?[/]")
                .PageSize(5)
                .AddChoices(versions.Keys);

                var selectedVersionKey = AnsiConsole.Prompt(mullvadVersionPrompt);
                version = versions[selectedVersionKey];
            }
            // No need for a final AnsiConsole.WriteLine() here after version selection,
            // as the prompt itself is interactive and self-contained.

            return $"{browser}{(string.IsNullOrEmpty(version) ? "" : " " + version)}";
        }

        private static int CloseBrowser(string browser)
        {
            var processNames = new Dictionary<string, string>
            {
                ["Firefox Stable"] = "firefox",
                ["Firefox Developer Edition"] = "firefox",
                ["Firefox Nightly"] = "firefox",
                ["Zen Beta"] = "zen",
                ["Zen Twilight"] = "zen",
                ["Floorp"] = "floorp",
                ["Mullvad Stable"] = "mullvadbrowser",
                ["Mullvad Alpha"] = "mullvadbrowser",
                ["Waterfox"] = "waterfox"
            };

            AnsiConsole.WriteLine($"\nKilling all processes of {processNames[browser]}...");

            Process[] processes = Process.GetProcessesByName(processNames[browser]);

            foreach (Process process in processes)
            {
                process.Kill();
                process.WaitForExit();
            }

            AnsiConsole.WriteLine($"Killed all {processes.Length} processes of {processNames[browser]}.");

            return 1;
        }

        private static string GetBrowserLocation(string browser)
        {
            var possibleLocations = new Dictionary<string, Dictionary<string, string[]>>
            {
                ["Firefox Stable"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { "C:\\Program Files\\Mozilla Firefox", "C:\\Program Files (x86)\\Mozilla Firefox" },
                    ["darwin"] = new[] { "/Applications/Firefox.app/Contents/Resources" },
                    ["linux"] = new[] { "/usr/lib/firefox/", "/opt/firefox/", "/root/snap/firefox/" }
                },
                ["Firefox Developer Edition"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { "C:\\Program Files\\Firefox Developer Edition", "C:\\Program Files (x86)\\Firefox Developer Edition" },
                    ["darwin"] = new[] { "/Applications/Firefox Developer Edition.app/Contents/Resources" },
                    ["linux"] = new[] { "/opt/firefox-developer-edition/" }
                },
                ["Firefox Nightly"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { "C:\\Program Files\\Firefox Nightly", "C:\\Program Files (x86)\\Firefox Nightly" },
                    ["darwin"] = new[] { "/Applications/Firefox Nightly.app/Contents/Resources" },
                    ["linux"] = new[] { "/opt/firefox-nightly/" }
                },
                ["Floorp"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { "C:\\Program Files\\Ablaze Floorp", "C:\\Program Files (x86)\\Ablaze Floorp" },
                    ["darwin"] = new[] { "/Applications/Floorp.app/Contents/Resources" },
                    ["linux"] = new[] { "/opt/floorp/" }
                },
                ["Zen Beta"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { "C:\\Program Files\\Zen Browser", "C:\\Program Files (x86)\\Zen Browser" },
                    ["darwin"] = new[] { "/Applications/Zen Browser.app/contents/resources", "/Applications/Zen.app/Contents/Resources" },
                    ["linux"] = new[] { "/opt/zen-browser-bin/", "/opt/zen-browser/", "/opt/zen/" }
                },
                ["Zen Twilight"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { "C:\\Program Files\\Zen Twilight", "C:\\Program Files (x86)\\Zen Twilight" },
                    ["darwin"] = new[] { "/Applications/Zen Browser.app/Twilight/contents/resources", "/Applications/Zen.app/Twilight/Contents/Resources", "/Applications/Twilight.app/Contents/Resources" },
                    ["linux"] = new[] { "/opt/zen-twilight/", "/opt/zen-browser-twilight/" }
                },
                ["Mullvad Stable"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { Path.Combine(homeDir, "AppData\\Local\\Mullvad\\MullvadBrowser\\Release") },
                    ["darwin"] = new[] { "/Applications/Mullvad Browser.app/Contents/Resources" },
                    ["linux"] = new[] { "/opt/mullvad-browser/" }
                },
                ["Mullvad Alpha"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { Path.Combine(homeDir, "AppData\\Local\\Mullvad\\MullvadBrowser\\Alpha") },
                    ["darwin"] = new[] { "/Applications/Mullvad Browser Alpha.app/Contents/Resources" },
                    ["linux"] = new[] { "/opt/mullvad-browser-alpha/" }
                },
                ["Waterfox"] = new Dictionary<string, string[]>
                {
                    ["win32"] = new[] { "C:\\Program Files\\Waterfox", "C:\\Program Files (x86)\\Waterfox" },
                    ["darwin"] = new[] { "/Applications/Waterfox.app/Contents/Resources" },
                    ["linux"] = new[] { "/opt/waterfox/" }
                }
            };

            var location = AutoDetectPath(possibleLocations, browser, false);

            if (location != null)
            {
                var validPath = AnsiConsole.Ask<string>($"[green]Do you wish to install Sine in {location} [/] (Y/n)?", "");
                if (!validPath.ToLower().Contains("n")) return location;
            }

            AnsiConsole.Markup($"\n[blue]Unable to automatically detect the location of {browser}, proceeding with manual prompt.[/]");
            return ManualLocationPrompt(browser);
        }

        private static int ClearStartupCache(string browser, string selectedProfile)
        {
            var localDir = selectedProfile.Replace("Roaming", "Local");
            if (platform == "win32" && Directory.Exists(Path.Combine(localDir, "startupCache")))
            {
                CloseBrowser(browser);

                Directory.Delete(Path.Combine(localDir, "startupCache"), true);
            }

            return 1;
        }

        private static string PromptProfileSelection(List<ProfileInfo> profiles)
        {
            var profileSelectionPrompt = new SelectionPrompt<ProfileInfo>()
            .Title("[bold green]Which [blue]profile[/] do you want to install Sine on?[/]")
            .PageSize(10)
            .MoreChoicesText("[grey](Move up and down to reveal more profiles)[/]");
            foreach (ProfileInfo profile in profiles){
                profileSelectionPrompt.AddChoice(profile);
            }
            profileSelectionPrompt.UseConverter(profile =>
            {
                return $"{profile.Name} [dim grey]({profile.Path.Replace("\\", "/")})[/]";
            });
            ProfileInfo selectedProfile = AnsiConsole.Prompt(profileSelectionPrompt);
            return selectedProfile.Path;
        }

        public static async Task DownloadAndExtractZipWithProgress(string zipUrl, string extractPath,
                                                                   IProgress<double>? downloadProgress = null)
        {
            Directory.CreateDirectory(extractPath);
            string tempZipPath = Path.Combine(Path.GetTempPath(), $"temp_{Guid.NewGuid()}.zip");
            try
            {
                AnsiConsole.WriteLine("Downloading zip file...");

                using (var response = await httpClient.GetAsync(zipUrl, HttpCompletionOption.ResponseHeadersRead))
                {
                    response.EnsureSuccessStatusCode();
                    var downloadedBytes = 0L;
                    using (var contentStream = await response.Content.ReadAsStreamAsync())
                    using (var fileStream = new FileStream(tempZipPath, FileMode.Create))
                    {
                        var buffer = new byte[8192];
                        var bytesRead = 0;
                        while ((bytesRead = await contentStream.ReadAsync(buffer, 0, buffer.Length)) > 0)
                        {
                            await fileStream.WriteAsync(buffer, 0, bytesRead);
                            downloadedBytes += bytesRead;

                            if (downloadProgress != null)
                            {
                                downloadProgress.Report(downloadedBytes);
                            }
                        }
                    }
                }

                AnsiConsole.WriteLine("Download completed. Extracting files...");
                ZipFile.ExtractToDirectory(tempZipPath, extractPath, overwriteFiles: true);
                AnsiConsole.WriteLine($"Files successfully extracted to the selected profile folder.");
            }
            finally
            {
                if (File.Exists(tempZipPath))
                {
                    File.Delete(tempZipPath);
                }
            }
        }

        public class ProfileInfo
        {
            required public string Name { get; set; }
            required public string Path { get; set; }
        }
    }
}
