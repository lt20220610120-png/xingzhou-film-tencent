!macro customInstall
  SetShellVarContext all
  CreateShortCut "$DESKTOP\Xingzhou Film Tencent.lnk" "$INSTDIR\Xingzhou Film Tencent Edition.exe" "" "$INSTDIR\Xingzhou Film Tencent Edition.exe" 0 SW_SHOWNORMAL "" "Xingzhou Film Tencent"
  SetShellVarContext current
  CreateShortCut "$DESKTOP\Xingzhou Film Tencent.lnk" "$INSTDIR\Xingzhou Film Tencent Edition.exe" "" "$INSTDIR\Xingzhou Film Tencent Edition.exe" 0 SW_SHOWNORMAL "" "Xingzhou Film Tencent"
!macroend
!macro customUnInstall
  SetShellVarContext all
  Delete "$DESKTOP\Xingzhou Film Tencent.lnk"
  SetShellVarContext current
  Delete "$DESKTOP\Xingzhou Film Tencent.lnk"
!macroend
