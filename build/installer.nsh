!macro customInstall
  ; electron-builder creates the shortcut in the selected install scope.
  ; Remove only the obsolete shortcut in the opposite scope.
  ${If} $installMode == "all"
    SetShellVarContext current
    Delete "$DESKTOP\Xingzhou Film Tencent.lnk"
    SetShellVarContext all
  ${Else}
    SetShellVarContext all
    Delete "$DESKTOP\Xingzhou Film Tencent.lnk"
    SetShellVarContext current
  ${EndIf}
!macroend
!macro customUnInstall
  SetShellVarContext all
  Delete "$DESKTOP\Xingzhou Film Tencent.lnk"
  SetShellVarContext current
  Delete "$DESKTOP\Xingzhou Film Tencent.lnk"
!macroend
