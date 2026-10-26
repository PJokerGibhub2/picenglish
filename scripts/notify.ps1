# notify.ps1 — ส่งเสียงแจ้งเตือนเมื่อ "งานเสร็จ"
#
# ใช้:  pwsh -File scripts/notify.ps1            (เสียงมาตรฐาน)
#       pwsh -File scripts/notify.ps1 -Kind done (เสียงจบงาน)
#       pwsh -File scripts/notify.ps1 -Kind error (เสียงเตือนผิดพลาด)
#
# ทำไมต้องมี: เวลาสั่งงานยาว ๆ ผู้ใช้จะได้ไม่ต้องเฝ้าจอ

param(
  [ValidateSet('done', 'error', 'ping')]
  [string]$Kind = 'done',
  [string]$Text = ''
)

$candidates = switch ($Kind) {
  'done'  { @('Windows Notify System Generic.wav', 'notify.wav', 'Windows Ding.wav', 'chimes.wav') }
  'error' { @('Windows Critical Stop.wav', 'Windows Error.wav', 'Alarm01.wav') }
  default { @('Windows Ding.wav', 'notify.wav') }
}

$played = $false
foreach ($name in $candidates) {
  $path = Join-Path 'C:\Windows\Media' $name
  if (Test-Path $path) {
    try {
      $player = New-Object System.Media.SoundPlayer $path
      $player.PlaySync()
      $played = $true
      break
    } catch { }
  }
}

if (-not $played) {
  # fallback: beep 2 ครั้ง (ทำงานได้แม้ไม่มีไฟล์เสียง)
  try { [console]::Beep(880, 140); Start-Sleep -Milliseconds 60; [console]::Beep(1320, 180) } catch { }
}

if ($Text) { Write-Output $Text }
exit 0
