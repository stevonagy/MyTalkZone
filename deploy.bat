@echo off
REM --------- CONFIG ---------
set SERVER=209.38.208.252
set USER=root
set LOCALAPP=C:\Apps\MyTalkZone.2.0
set REMOTEDIR=/var/www
set ACTIVE=DesoTalk_ver.1
set NEWNAME=DesoTalk_ver.1.new
set DEPLOYSH=/root/deploy_mytalkzone.sh
REM --------------------------

echo ==^> Priprema .new direktorija na serveru...
ssh %USER%@%SERVER% "set -e; mkdir -p %REMOTEDIR%; rm -rf %REMOTEDIR%/%NEWNAME%; mkdir -p %REMOTEDIR%/%NEWNAME%"

echo ==^> Kopiram lokalne fajlove direktno (scp -r) ...
scp -r "%LOCALAPP%" %USER%@%SERVER%:%REMOTEDIR%/%NEWNAME%/

echo ==^> Usklađujem strukturu na serveru (spljoštavanje, ako treba)...
ssh %USER%@%SERVER% "set -e; NEW=%REMOTEDIR%/%NEWNAME%; if [ -d \"\$NEW/MyTalkZone.2.0\" ]; then mv \"\$NEW/MyTalkZone.2.0\"/* \"\$NEW\"/; rmdir \"\$NEW/MyTalkZone.2.0\"; fi"

echo ==^> Pokrećem server-side deploy skriptu...
ssh %USER%@%SERVER% "bash %DEPLOYSH% --parent %REMOTEDIR% --active %ACTIVE% --new %NEWNAME%"

echo ==^> PM2 status i zadnjih 60 linija loga:
ssh %USER%@%SERVER% "pm2 status && pm2 logs mytalkzone --lines 60"

echo Gotovo ✅
pause
