param(
  [Parameter(Mandatory = $true)][string]$Printer,
  [Parameter(Mandatory = $true)][string]$B64
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class PrinterRaw {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, IntPtr di);
    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
    [DllImport("kernel32.dll", EntryPoint = "GetLastError")]
    public static extern int GetLastError();
}
"@

$bytes = [System.Convert]::FromBase64String($B64)
$h = [IntPtr]::Zero
if (-not [PrinterRaw]::OpenPrinter($Printer, [ref]$h, [IntPtr]::Zero)) {
    $err = [PrinterRaw]::GetLastError()
    Write-Error "No se pudo abrir la impresora '$Printer' (error $err). Verifica que el nombre sea exacto."
    exit 1
}
try {
    $di = New-Object PrinterRaw+DOCINFOA
    $di.pDocName = "POS Ticket"
    $di.pOutputFile = ""
    $di.pDataType = "RAW"
    $pDi = [System.Runtime.InteropServices.Marshal]::AllocHGlobal([System.Runtime.InteropServices.Marshal]::SizeOf($di))
    [System.Runtime.InteropServices.Marshal]::StructureToPtr($di, $pDi, $false)
    try {
        if (-not [PrinterRaw]::StartDocPrinter($h, 1, $pDi)) {
            Write-Error "StartDocPrinter fallo (error $([PrinterRaw]::GetLastError()))"
            exit 1
        }
        [PrinterRaw]::StartPagePrinter($h) | Out-Null
        $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
        [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
        try {
            $written = 0
            $ok = [PrinterRaw]::WritePrinter($h, $ptr, $bytes.Length, [ref]$written)
            if (-not $ok) {
                Write-Error "WritePrinter fallo (error $([PrinterRaw]::GetLastError()))"
                exit 1
            }
        } finally {
            [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
        }
        [PrinterRaw]::EndPagePrinter($h) | Out-Null
        [PrinterRaw]::EndDocPrinter($h) | Out-Null
    } finally {
        [System.Runtime.InteropServices.Marshal]::FreeHGlobal($pDi)
    }
} finally {
    [PrinterRaw]::ClosePrinter($h) | Out-Null
}
Write-Output "OK"
