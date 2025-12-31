@echo off
echo Fixing remote configuration...
git remote remove origin
git remote add origin https://github.com/km4994089/Trending-portal.git
git branch -m main

echo Starting upload process...
git add .
git commit -m "feat: manual sync and upload"
echo Pulling changes...
git pull --rebase origin main
echo Pushing changes...
git push origin main
echo Done!
pause
