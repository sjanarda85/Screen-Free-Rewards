# Screen Free Rewards: Android and iPhone apps

This folder wraps the web app (`../index.html`) in a real Android and iOS app with Capacitor. The project files are ready. Building them needs the Android or Apple tools, which are free to install.

## Android (APK)
**Easiest: let GitHub build it.** On GitHub open Actions, pick "Build mobile apps", press Run workflow. After about 5 minutes the APK is under Artifacts. Copy it to the phone, open it, and allow "install unknown apps" once.

**On your own computer** (needs Node 22, Java 17, Android Studio):
```
cd mobile
npm install
npm run android:sync
cd android && ./gradlew assembleDebug
```
The APK is `android/app/build/outputs/apk/debug/app-debug.apk`. For the Play Store, build a signed bundle in Android Studio (Build, Generate Signed Bundle).

## iPhone (IPA)
Apple only allows iPhone apps to be built on a Mac with Xcode and signed with an Apple Developer account (99 USD a year). Free test builds expire after 7 days.
```
cd mobile
npm install
npm run ios:sync
cd ios/App && pod install
open App.xcworkspace
```
In Xcode choose your team under Signing, pick the iPhone, press Run. For the App Store use Product, Archive. The GitHub workflow also produces an unsigned simulator build for checking.

## Without any store: install the web app
Open the app link in the phone browser.
- Android (Chrome): menu, Install app.
- iPhone (Safari): Share, Add to Home Screen.
It then opens full screen with its own icon and works offline. This needs no account and no tools.

## Updating
After any change to `../index.html`, run `npm run android:sync` or `npm run ios:sync`, then rebuild.

## Limits
These wrappers run the same web app inside a native shell. They still cannot see other apps or lock the phone. That needs the native companion described in `../docs/COMPANION.md`.
