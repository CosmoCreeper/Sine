# Contributing to Sine

We invite all users, whether unskilled or skilled in this region of programming, to contribute to Sine. We are a small team, mostly comprised of [@CosmoCreeper](https://github.com/CosmoCreeper) and a few other members. If you are found to be interested and skilled in contributing to Sine, you may be added to our official team.

## Setting up a developer environment

Before you can write production-level code for Sine that runs in the browser, you must first configure your developer environment.

### Prerequisites

- **Windows**: [Git Bash](https://git-scm.com/install/windows)
- **Linux/macOS**: [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- [Bun](https://bun.sh)
- [uv](https://docs.astral.sh/uv/)

### Steps

If you're on Windows, open Git Bash. If you're on Linux/macOS, open your terminal (must have git installed). This is where we will perform all the actions required to get your developer environment set up.

Navigate to the folder you want to place your Sine code clone into (you can use the `cd` command to do so). Now paste these commands into your terminal and press enter:

```sh
git clone https://github.com/CosmoCreeper/Sine.git sine
cd sine
```

Now you have to use Bun to initialize the project's dependencies:

```sh
bun run init
```

And now you can contribute in any way you like!

Below are some of our common scripts for developing.

```sh
bun lint # Lints all files
bun lint:fix # Fixes linter errors where possible

bun fmt:check # Checks formatting
bun fmt # Formats files

bun run test # Runs test suite

bun dev # Executes code in an isolated browser env
```
