@echo off
echo Starting upload process...
git add .
git commit -m "feat: manual sync and upload"
echo Pulling changes...
git pull --rebase origin main
echo Pushing changes...
git push origin main
echo Done!
pause
