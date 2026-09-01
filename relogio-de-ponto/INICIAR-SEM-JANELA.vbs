' ===========================================================================
'  Liga o Relogio de Ponto SEM a janela preta.
'  Clique duas vezes. Nada aparece na tela: e assim mesmo.
'
'  Para conferir se subiu, abra  http://localhost:3000/kiosk/
'  Para desligar, clique duas vezes em  PARAR.bat
' ===========================================================================

Option Explicit

Dim shell, fso, pasta, node, comando
Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")

pasta = fso.GetParentFolderName(WScript.ScriptFullName)

' --- acha o node.exe, na mesma ordem do INICIAR.bat ------------------------
node = ""
If fso.FileExists(pasta & "\node.exe") Then
    node = pasta & "\node.exe"
End If

If node = "" And fso.FileExists(pasta & "\node-encontrado.txt") Then
    Dim arq, caminho
    Set arq = fso.OpenTextFile(pasta & "\node-encontrado.txt", 1)
    If Not arq.AtEndOfStream Then
        caminho = Trim(arq.ReadLine)
        If fso.FileExists(caminho) Then node = caminho
    End If
    arq.Close
End If

If node = "" Then
    Dim tentativas, t
    tentativas = Array( _
        shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe", _
        shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\nodejs\node.exe", _
        shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\nodejs\node.exe")
    For Each t In tentativas
        If node = "" And fso.FileExists(t) Then node = t
    Next
End If

If node = "" Then
    MsgBox "O Node.js nao foi encontrado nesta maquina." & vbCrLf & vbCrLf & _
           "Clique duas vezes em INSTALAR.bat primeiro.", 16, "Relogio de Ponto"
    WScript.Quit 1
End If

' --- confere que o sistema ja foi instalado --------------------------------
If Not fso.FolderExists(pasta & "\node_modules") Or Not fso.FileExists(pasta & "\.env") Then
    MsgBox "O sistema ainda nao foi instalado ou configurado." & vbCrLf & vbCrLf & _
           "Clique duas vezes em INSTALAR.bat primeiro.", 16, "Relogio de Ponto"
    WScript.Quit 1
End If

' --- sobe escondido --------------------------------------------------------
' O 0 e o que esconde a janela. O False faz este script sair na hora, sem
' esperar o servidor terminar (ele fica no ar ate voce mandar parar).
shell.CurrentDirectory = pasta
comando = """" & node & """ """ & pasta & "\src\index.js"""
shell.Run comando, 0, False

WScript.Sleep 3000
shell.Run "http://localhost:3000/kiosk/", 1, False
