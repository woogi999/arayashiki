// The setup's icon, its name in Explorer, and a manifest asking for the
// modern common controls (the task dialog lives only there) and sharp
// text on high-DPI screens.
fn main() {
    let mut res = tauri_winres::WindowsResource::new();
    res.set_icon("../icons/icon.ico");
    res.set("FileDescription", "Arayashiki Setup");
    res.set("ProductName", "Arayashiki");
    res.set("CompanyName", "woogi999");
    res.set("LegalCopyright", "Arayashiki by woogi999 · MIT");
    res.set_manifest(
        r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0"
        processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*" />
    </dependentAssembly>
  </dependency>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false" /></requestedPrivileges></security>
  </trustInfo>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>
    </windowsSettings>
  </application>
</assembly>"#,
    );
    res.compile().expect("the setup's resources didn't compile");
}
