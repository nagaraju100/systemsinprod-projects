# Private ChatGPT on One Mac mini — setup scripts

Run a 35B open-source model on a Mac mini, serve it as a web chat app over a private network.

## What this folder contains

| File | Purpose |
|---|---|
| `install-splash.sh` | One-command installer — installs Splash, writes LaunchAgent, starts the server |
| `tailscale-setup.sh` | Helpers for joining the tailnet and printing Tailscale URLs |
| `verify.sh` | Health-check script that returns exit 0/1 (for monitoring or cron) |

## One-command setup

On your Mac mini:

```bash
# Clone this repo and run the installer
git clone https://github.com/nagaraju100/systemsinprod-projects.git
cd systemsinprod-projects/private-chat-on-mac-mini
chmod +x install-splash.sh
./install-splash.sh
```

The script does:

1. `brew install incoai/tap/splash`
2. Downloads Qwen3.6-35B-A3B (4-bit) + matching DFlash2 draft (~24 GB)
3. Starts `splash serve` on port 8000 with the API key you specify
4. Registers a LaunchAgent so Splash starts on reboot
5. Prints the Tailscale HTTPS URL you can share

## Requirements

- Apple Silicon Mac (M3+ recommended)
- 48 GB unified memory (36 GB minimum)
- macOS 26.4+
- Homebrew
- Tailscale installed (tailscale.com)

## Quick manual start

```bash
brew install incoai/tap/splash
splash serve --model mlx-community/Qwen3.6-35B-A3B-4bit --host 0.0.0.0 --port 8000 --api-key YOUR_KEY
```

See the [use case page](https://systemsinprod.com/use-cases/private-chat-on-mac-mini/) for the full write-up.
