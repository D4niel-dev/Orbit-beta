# Orbit Mobile — Android Build Script
# Prerequisites: Android Studio (with SDK), Java 17+
# Run from the mobile/ directory

Write-Host "=== Orbit Mobile Android Build ===" -ForegroundColor Cyan

# Step 1: Sync shared modules
Write-Host "[1/4] Syncing shared modules..." -ForegroundColor Yellow
npm run shared:sync

# Step 2: Sync Capacitor
Write-Host "[2/4] Syncing Capacitor Android project..." -ForegroundColor Yellow
npx cap sync android

# Step 3: Build debug APK
Write-Host "[3/4] Building debug APK..." -ForegroundColor Yellow
Set-Location -LiteralPath "android"
./gradlew assembleDebug
Set-Location ..

# Step 4: Locate APK
$apkPath = "android\app\build\outputs\apk\debug"
if (Test-Path $apkPath) {
    $apk = Get-ChildItem -LiteralPath $apkPath -Filter "*.apk" | Select-Object -First 1
    if ($apk) {
        Write-Host "[4/4] APK ready:" -ForegroundColor Green
        Write-Host "  $($apk.FullName)" -ForegroundColor Green
    }
}

Write-Host "=== Build complete ===" -ForegroundColor Cyan
