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

namespace SineInstaller
{
    public class Program
    {
        private static readonly HttpClient httpClient = new HttpClient();
        private static readonly string platform = GetPlatform();
        private static readonly string homeDir = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        private static readonly bool isLinux = platform == "linux";
        private static readonly bool isCosine = true;
        private static readonly string sineBranch = isCosine ? "cosine" : "main";

        public static async Task Main(string[] args)
        {
            try
            {
                await MainAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"\nAn unexpected error occurred: {ex.Message}");
                await Exit();
            }
        }

        private static async Task MainAsync()
        {
            Console.WriteLine("==> Sine Installer -- v2 <==\n");

            if (!IsSupportedPlatform())
            {
                Console.WriteLine("Sorry, you don't use a supported platform for the auto-installer.\nPlease consider manually installing or post about it on our github repository.");
                await Exit();
                return;
            }

            var browser = await GetBrowser();
            var browserLocation = await GetBrowserLocation(browser);

            string profileDir;
            string tempUsername = null;

            if (isLinux)
            {
                // Note: C# doesn't have direct equivalent to process.getuid(), 
                // so we'll skip the root check for this translation
                tempUsername = await PromptUsername();
            }

            try
            {
                profileDir = await GetProfileDir(browser.Split(' ')[0], tempUsername);
                if (!Directory.Exists(profileDir))
                {
                    throw new DirectoryNotFoundException($"Profile directory not found at {profileDir}.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Profile directory error: {ex.Message}");
                return;
            }

            var profiles = await GetProfiles(profileDir);
            if (profiles.Count == 0)
            {
                Console.WriteLine("No profiles found in the profile directory.");
                return;
            }

            var selectedProfile = await PromptProfileSelection(profiles);

            var shouldInstall = await PromptInput($"\nDo you want to remove Sine from the selected profile? (yes/no):");
            if (shouldInstall.Equals("yes", StringComparison.OrdinalIgnoreCase))
            {
                await UninstallSine(selectedProfile); 
            }
            else
            {
                await InstallFxAutoconfig(selectedProfile, browserLocation);
                await InstallSine(selectedProfile);
            }

            ClearStartupCache(browser, selectedProfile);

            Console.WriteLine();
            await Exit();
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

        private static async Task Exit()
        {
            Console.Write("Enter anything to exit: ");
            Console.ReadLine();
            Environment.Exit(1);
        }

        private static async Task<string> PromptInput(string message)
        {
            Console.Write(message + " ");
            return Console.ReadLine();
        }

        private static async Task<string> PromptSelect(string message, Dictionary<string, string> choices)
        {
            Console.WriteLine(message);
            var choicesList = choices.ToList();
            
            for (int i = 0; i < choicesList.Count; i++)
            {
                Console.WriteLine($"{i + 1}. {choicesList[i].Key}");
            }

            while (true)
            {
                Console.Write("Enter your choice (1-" + choicesList.Count + "): ");
                if (int.TryParse(Console.ReadLine(), out int choice) && 
                    choice >= 1 && choice <= choicesList.Count)
                {
                    return choicesList[choice - 1].Value;
                }
                Console.WriteLine("Invalid choice. Please try again.");
            }
        }

        private static async Task<string> ManualLocationPrompt(string promptFor)
        {
            string location = "";
            bool notFirstLoop = false;

            while (!Directory.Exists(location) && !File.Exists(location))
            {
                if (notFirstLoop)
                {
                    Console.WriteLine("\nYou can't input non-existent paths.");
                }
                else
                {
                    notFirstLoop = true;
                }

                location = await PromptInput($"Enter the location of {promptFor} on your system:");
            }

            return location;
        }

        private static string AutoDetectPath(Dictionary<string, Dictionary<string, string[]>> possibleLocations, 
            string browser, bool isProfile, string tempUsername = null)
        {
            if (!possibleLocations.ContainsKey(browser))
            {
                Console.WriteLine($"\nWe do not currently support automatic location detection of {browser}{(isProfile ? "'s profiles folder" : "")}.");
                Console.WriteLine("If you believe we should support this browser, you may post an issue on our github page.");
                return null;
            }

            var browserLocations = possibleLocations[browser];
            if (!browserLocations.ContainsKey(platform))
            {
                Console.WriteLine($"\nWe do not currently support automatic location detection of {browser}{(isProfile ? "'s profiles folder" : "")} on {platform}.");
                Console.WriteLine("If you believe we should support this platform, you may post an issue on our github page.");
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
                    if (!isProfile) Console.WriteLine();
                    Console.WriteLine($"Successfully found the {(isProfile ? "profiles folder" : "installation directory")} for {browser} on {platform}.");
                    if (isProfile) Console.WriteLine();
                    return fullPath;
                }
            }

            Console.WriteLine($"\nWe do not currently support automatic location detection of {browser}{(isProfile ? "'s profiles folder" : "")}.");
            Console.WriteLine("If you believe we should support this, you may post an issue on our github page.");
            return null;
        }

        private static async Task<string> GetProfileDir(string browser, string tempUsername)
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

            Console.WriteLine($"\nUnable to automatically detect the location of {browser}'s profile folder, proceeding with manual prompt.");
            return await ManualLocationPrompt($"{browser}'s profile folder");
        }

        private static async Task<List<ProfileInfo>> GetProfiles(string profileDir)
        {
            var iniPath = Path.Combine(profileDir, isLinux ? "" : "..", "profiles.ini");
            var profiles = new List<ProfileInfo>();

            try
            {
                var iniContent = await File.ReadAllTextAsync(iniPath);
                var lines = iniContent.Split('\n');
                Dictionary<string, string> currentProfile = null;

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
                Console.WriteLine($"Error reading profiles.ini: {ex.Message}");
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

        private static async Task<string> PromptUsername()
        {
            return await PromptInput("\nEnter the name of the username to install Sine into:");
        }

        private static async Task DownloadFile(string url, string destinationPath)
        {
            try
            {
                var response = await httpClient.GetAsync(url);
                response.EnsureSuccessStatusCode();
                
                Directory.CreateDirectory(Path.GetDirectoryName(destinationPath));
                
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
                Console.WriteLine($"Installed {file}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to install {file}: {ex.Message}");
                await Exit();
            }
        }

        private static async Task InstallFxAutoconfig(string profilePath, string programPath)
        {
            Console.WriteLine("\nInstalling Fx-AutoConfig...\n");

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
                    Console.WriteLine(ex.Message);
                }
            }

            foreach (var file in filesToInstall)
            {
                var url = $"https://raw.githubusercontent.com/MrOtherGuy/fx-autoconfig/master/profile/chrome/{file}";
                try
                {
                    await SetupFileDownload(profilePath, "chrome/" + file, url);
                }
                catch (Exception ex)
                {
                    Console.WriteLine(ex.Message);
                }
            }

            Console.WriteLine("\nFx-AutoConfig has been installed successfully!");
        }

        private static async Task InstallSine(string profilePath)
        {
            Console.WriteLine("\nInstalling Sine...");

            var zipURL = $"https://raw.githubusercontent.com/CosmoCreeper/Sine/{sineBranch}/deployment/engine.zip";
            try
            {
                await DownloadAndExtractZipWithProgress(zipURL, Path.Combine(profilePath, "chrome", "JS"));
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
            }

            Console.WriteLine("\nSine has been installed successfully!");
        }

        private static async Task UninstallSine(string profilePath)
        {
            Console.WriteLine("\nUninstalling Sine...");

            var sinePath = Path.Combine(profilePath, "chrome", "JS", "sine.uc.mjs");
            if (!File.Exists(sinePath))
            {
                Console.WriteLine("Sine is not installed in the specified profile.");
                return;
            }
            else
            {
                File.Delete(sinePath);
                Console.WriteLine("Successfully removed the control script.");
            }

            var enginePath = Path.Combine(profilePath, "chrome", "JS", "engine");
            if (Directory.Exists(enginePath))
            {
                try
                {
                    Directory.Delete(sinePath, true);
                    Console.WriteLine("Successfully removed the Sine engine.");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Failed to uninstall Sine: {ex.Message}");
                }
            }
        }

        private static async Task<string> GetBrowser()
        {
            var browsers = new Dictionary<string, string>
            {
                ["Firefox"] = "Firefox",
                ["Zen"] = "Zen",
                ["Floorp"] = "Floorp",
                ["Mullvad"] = "Mullvad",
                ["Waterfox"] = "Waterfox"
            };

            var browser = await PromptSelect("What browser do you which to install Sine on (you may select canary/beta builds later)?", browsers);

            Console.WriteLine();

            string version = "";
            if (browser == "Firefox")
            {
                var versions = new Dictionary<string, string>
                {
                    ["Stable"] = "Stable",
                    ["Developer Edition"] = "Developer Edition",
                    ["Nightly"] = "Nightly"
                };
                version = await PromptSelect("What version of Firefox do you use (stable will work with beta)?", versions);
            }
            else if (browser == "Zen")
            {
                var versions = new Dictionary<string, string>
                {
                    ["Beta"] = "Beta",
                    ["Twilight"] = "Twilight"
                };
                version = await PromptSelect("What version of Zen do you use (beta is default)?", versions);
            }
            else if (browser == "Mullvad")
            {
                var versions = new Dictionary<string, string>
                {
                    ["Stable"] = "Stable",
                    ["Alpha"] = "Alpha"
                };
                version = await PromptSelect("What version of Mullvad do you use?", versions);
            }

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

            Console.WriteLine($"\nKilling all processes of {processNames[browser]}...");

            Process[] processes = Process.GetProcessesByName(processNames[browser]);

            foreach (Process process in processes)
            {
                process.Kill();
                process.WaitForExit();
            }

            Console.WriteLine($"Killed all {processes.Length} processes of {processNames[browser]}.");
            
            return 1;
        }

        private static async Task<string> GetBrowserLocation(string browser)
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
            if (location != null) return location;

            Console.WriteLine($"\nUnable to automatically detect the location of {browser}, proceeding with manual prompt.");
            return await ManualLocationPrompt(browser);
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

        private static async Task<string> PromptProfileSelection(List<ProfileInfo> profiles)
        {
            var choices = profiles.ToDictionary(p => p.Name, p => p.Path);
            return await PromptSelect("Which profile do you want to install Sine on?", choices);
        }

        public static async Task DownloadAndExtractZipWithProgress(string zipUrl, string extractPath, 
            IProgress<double> downloadProgress = null)
        {
            Directory.CreateDirectory(extractPath);
            string tempZipPath = Path.Combine(Path.GetTempPath(), $"temp_{Guid.NewGuid()}.zip");
            try
            {
                Console.WriteLine("Downloading zip file...");
                
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
                
                Console.WriteLine("Download completed. Extracting files...");
                ZipFile.ExtractToDirectory(tempZipPath, extractPath, overwriteFiles: true);
                Console.WriteLine($"Files successfully extracted to the selected profile folder.");
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
            public string Name { get; set; }
            public string Path { get; set; }
        }
    }
}
