using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;

namespace LitUpdater
{
    class Program
    {
        const string REPO_OWNER = "Rajat1657";
        const string REPO_NAME = "LitBrowser";
        const string PROCESS_NAME = "Lit Browser";

        static void Main(string[] args)
        {
            Console.Title = "Lit Browser Auto-Updater";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine(@"
   ============================================================
                     🔥 LIT BROWSER UPDATER
                     Fast, Seamless & Automated
   ============================================================");
            Console.ResetColor();
            Console.WriteLine();

            bool isSilent = false;
            foreach (var arg in args)
            {
                if (arg.Equals("/silent", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("-s", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("--silent", StringComparison.OrdinalIgnoreCase))
                {
                    isSilent = true;
                }
            }

            try
            {
                // Step 1: Safely close running instances
                Log("Checking for running instances of Lit Browser...", ConsoleColor.Yellow);
                KillRunningProcesses();

                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string installDir = Path.Combine(localApp, "Programs", "LitBrowser");
                string targetExe = Path.Combine(installDir, "Lit Browser.exe");

                // Step 2: Look for local build source (dist\win-unpacked)
                string sourceDir = FindUnpackedSource(baseDir);

                if (!string.IsNullOrEmpty(sourceDir) && Directory.Exists(sourceDir))
                {
                    Log("Applying latest updates to: " + installDir, ConsoleColor.Cyan);
                    Directory.CreateDirectory(installDir);

                    // Copy all files
                    CopyDirectory(sourceDir, installDir);
                    Log("Successfully updated all application binaries!", ConsoleColor.Green);
                }
                else
                {
                    // Fallback to GitHub Release
                    Log("Checking GitHub for the latest release...", ConsoleColor.Yellow);
                    CheckAndDownloadFromGitHub(installDir);
                }

                // Step 3: Ensure desktop and start menu shortcuts exist
                EnsureShortcuts(targetExe);

                // Step 4: Relaunch Lit Browser
                Log("Relaunching Lit Browser...", ConsoleColor.Cyan);
                if (File.Exists(targetExe))
                {
                    Process.Start(targetExe);
                }

                Log("Update completed successfully! Enjoy browsing with Lit. 🔥", ConsoleColor.Green);
                if (!isSilent)
                {
                    Thread.Sleep(2000);
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("\n[ERROR] Update failed: " + ex.Message);
                Console.ResetColor();

                if (!isSilent)
                {
                    Console.WriteLine("\nPress any key to exit...");
                    try { Console.ReadKey(); } catch { }
                }
            }
        }

        static void Log(string msg, ConsoleColor color)
        {
            Console.ForegroundColor = color;
            Console.WriteLine("  [*] " + msg);
            Console.ResetColor();
        }

        static void KillRunningProcesses()
        {
            var processes = Process.GetProcessesByName(PROCESS_NAME);
            if (processes.Length > 0)
            {
                Console.WriteLine("  [!] Found " + processes.Length + " running Lit Browser process(es). Closing safely...");
                foreach (var p in processes)
                {
                    try
                    {
                        p.Kill();
                        p.WaitForExit(3000);
                    }
                    catch { }
                }
                Thread.Sleep(1000);
            }
        }

        static string FindUnpackedSource(string baseDir)
        {
            string[] candidates = new string[]
            {
                Path.Combine(baseDir, "dist", "win-unpacked"),
                Path.Combine(baseDir, "..", "dist", "win-unpacked"),
                Path.Combine(baseDir, "win-unpacked")
            };

            foreach (var dir in candidates)
            {
                if (Directory.Exists(dir) && File.Exists(Path.Combine(dir, "Lit Browser.exe")))
                {
                    return Path.GetFullPath(dir);
                }
            }
            return null;
        }

        static void CopyDirectory(string sourceDir, string targetDir)
        {
            foreach (string dirPath in Directory.GetDirectories(sourceDir, "*", SearchOption.AllDirectories))
            {
                Directory.CreateDirectory(dirPath.Replace(sourceDir, targetDir));
            }

            foreach (string newPath in Directory.GetFiles(sourceDir, "*.*", SearchOption.AllDirectories))
            {
                try
                {
                    File.Copy(newPath, newPath.Replace(sourceDir, targetDir), true);
                }
                catch { }
            }
        }

        static void CheckAndDownloadFromGitHub(string installDir)
        {
            try
            {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
                using (var client = new WebClient())
                {
                    client.Headers.Add("User-Agent", "LitBrowser-Updater");
                    string apiUrl = string.Format("https://api.github.com/repos/{0}/{1}/releases/latest", REPO_OWNER, REPO_NAME);
                    string json = client.DownloadString(apiUrl);

                    int idx = json.IndexOf("\"browser_download_url\":");
                    if (idx != -1)
                    {
                        int start = json.IndexOf("\"", idx + 23) + 1;
                        int end = json.IndexOf("\"", start);
                        string downloadUrl = json.Substring(start, end - start);

                        if (!string.IsNullOrEmpty(downloadUrl) && downloadUrl.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                        {
                            string tempFile = Path.Combine(Path.GetTempPath(), "LitBrowserSetup.exe");
                            Log("Downloading update from GitHub...", ConsoleColor.Cyan);
                            client.DownloadFile(downloadUrl, tempFile);

                            Log("Installing latest update...", ConsoleColor.Cyan);
                            var p = Process.Start(new ProcessStartInfo(tempFile, "/S") { UseShellExecute = false });
                            if (p != null) p.WaitForExit(60000);
                        }
                    }
                }
            }
            catch (Exception e)
            {
                Log("GitHub check: " + e.Message, ConsoleColor.DarkGray);
            }
        }

        static void EnsureShortcuts(string targetExe)
        {
            try
            {
                string script = string.Format(
                    @"$s = New-Object -ComObject WScript.Shell; " +
                    @"$d = $s.CreateShortcut('{0}\Lit Browser.lnk'); $d.TargetPath='{1}'; $d.Save(); " +
                    @"$m = $s.CreateShortcut('{2}\Lit Browser.lnk'); $m.TargetPath='{1}'; $m.Save();",
                    Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
                    targetExe.Replace("'", "''"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs")
                );

                Process.Start(new ProcessStartInfo("powershell", "-NoProfile -Command \"" + script + "\"")
                {
                    CreateNoWindow = true,
                    UseShellExecute = false
                });
            }
            catch { }
        }
    }
}
