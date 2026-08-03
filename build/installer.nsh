!macro customInstall
  SetShellVarContext all
  Delete "$DESKTOP\行舟影视.lnk"
  SetShellVarContext current
  Delete "$DESKTOP\行舟影视.lnk"
  CreateShortCut "$DESKTOP\行舟影视.lnk" "$INSTDIR\行舟影视.exe" "" "$INSTDIR\行舟影视.exe" 0 SW_SHOWNORMAL "" "行舟影视"
!macroend
!macro customUnInstall
  SetShellVarContext all
  Delete "$DESKTOP\行舟影视.lnk"
  SetShellVarContext current
  Delete "$DESKTOP\行舟影视.lnk"
!macroend
