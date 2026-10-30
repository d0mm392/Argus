# Discord Social SDK helper

Standalone Windows x64 process, licensed separately under MIT (LICENSE.txt).
It links only Discord's SDK and Windows libraries, not the GPL Argus application.
The public application ID is shared by every Argus user. There is no client secret,
personal account ID or embedded token. OAuth uses PKCE and exactly `openid
sdk.social_layer_presence`. No SDK file logging, raw error logging, messages,
friendship writes, voice capture or activity updates are enabled.

Developer setup happens once for the Argus application: enable Social SDK and
Public Client in the developer portal, register the SDK desktop callback, and
download the official SDK. End users install the complete Argus installer and use
the ordinary Connect/Disconnect controls; they do not configure a developer app.

Build with the installed Visual Studio x64 Build Tools:

```powershell
./native/build-discord-social.ps1 -SdkRoot <extracted-official-sdk> -OutputDirectory <isolated-repo-build-output>
```

The build validates Discord's DLL signature and performs a C++ syntax check before
building. The helper uses the static compiler runtime; Discord's supplied DLL
depends on standard Windows DLLs. The installer must include the helper, the
unmodified Discord runtime, this helper's license and the SDK third-party notices.
Do not put SDK headers, import libraries or SDK ZIP files into the public source.
Discord SDK files are governed by the [Social SDK Terms](https://support-dev.discord.com/hc/en-us/articles/30225844245271-Discord-Social-SDK-Terms),
including distribution as integrated into an application (section 2.a), and remain
separate from the MIT helper and GPL Argus code. Their licenses are not replaced.

The parent uses private stdin/stdout pipes. Token events must never be logged or
returned to renderer IPC. Only the parent stores credentials, encrypted by the
Windows account via Electron safeStorage, separately from settings and backups.
Friends/account snapshots are memory-only. Disconnect deletes local credentials,
clears snapshots immediately and attempts SDK token revocation with a deadline.
Cancellation kills the old helper generation, so late callbacks cannot restore a
disconnected account. No account is hardcoded or shared between users.

Current packaged target: Windows x64. Other platform builds must provide and test
their own native runtime plus secure account storage before enabling this feature;
they must not expose a fake successful connection or ask users to obtain SDK files.
