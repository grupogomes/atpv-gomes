# Agente para leitores NITGEN (Hamster DX)

O **Hamster DX é um leitor da NITGEN.** A Fingertech é a distribuidora no
Brasil — o SDK que você precisa é o **eNBSP SDK da Nitgen**.

## 0. Antes de tudo: veja se o SDK já não está aí

Se o leitor já é usado por outro sistema nesta máquina, o SDK provavelmente já
está instalado e não há o que baixar. Para descobrir, clique duas vezes em
**`VERIFICAR-LEITOR.bat`**, na pasta do relógio de ponto.

Ele só consulta — não instala nem altera nada — e diz quatro coisas:

- se o leitor está plugado e reconhecido pelo Windows;
- onde está a `NITGEN.SDK.NBioBSP.dll`, se estiver em algum lugar;
- **qual outro programa está com o leitor aberto neste momento**;
- se falta o compilador C# ou o .NET Framework 3.5.

Achando o SDK, pule direto para o passo 2.

### Um leitor, dois sistemas

O eNBSP abre o leitor em modo exclusivo: **dois programas não conseguem usar o
mesmo leitor ao mesmo tempo.** Se o outro sistema fica aberto o dia todo, o
agente do ponto não vai conseguir capturar enquanto ele estiver rodando, e
vice-versa. O verificador mostra quem está segurando o aparelho.

Se os dois precisarem conviver, as saídas são um segundo leitor, ou fechar um
enquanto se usa o outro. Não há como contornar isso por software.

## 1. Obter o SDK

São **dois** arquivos, com papéis diferentes:

| Arquivo | O que é | Onde costuma estar |
|---|---|---|
| `NBioBSP.dll` | O motor, nativo | Vem com o driver/SDK. Qualquer sistema que use o leitor tem este |
| `NITGEN.SDK.NBioBSP.dll` | A casca para .NET, usada pelo agente | Só no eNBSP SDK |

**Os dois são de 32 bits.** É por isso que o `compilar.ps1` passa
`/platform:x86` — um executável de 64 bits recusa as duas DLLs com
`BadImageFormatException`, e a mensagem não explica a causa.

### Onde baixar

1. Site da Nitgen Brasil:
   <http://www.nitgen.com.br/download/eNBSP_SDK_v4.85.zip>
   (pode estar fora do ar)

2. **Fingertech**, distribuidora no Brasil — página de SDKs para
   desenvolvedores: <http://suporte.fingertech.com.br/devs-download-sdk/>.
   Como vendem o leitor, fornecem o SDK a quem comprou.

3. A própria Fingertech publica a casca .NET num exemplo aberto:
   <https://github.com/FingerTechBR/Sample_export_crud> —
   arquivo `FpToExportImage/bin/Debug/NITGEN.SDK.NBioBSP.dll`.
   Isso resolve metade do problema; a `NBioBSP.dll` nativa continua
   vindo do driver.

4. Quem instalou o outro sistema que usa o leitor nesta empresa.

O `VERIFICAR-LEITOR.bat` diz quais dessas DLLs já estão na máquina.

Instale e plugue o leitor. O Windows precisa reconhecê-lo antes de qualquer
outra coisa — confira no Gerenciador de Dispositivos.

O SDK exige **.NET Framework 3.5** em Windows 64 bits. Se não estiver
instalado:

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName NetFx3 -All
```

## 2. Compilar o agente

```powershell
cd agente-biometrico\nitgen
.\compilar.ps1
```

Não precisa de Visual Studio: o compilador C# já vem com o Windows. O script
localiza a `NITGEN.SDK.NBioBSP.dll` sozinho, copia as DLLs necessárias para
esta pasta e gera o `agente-nitgen.exe`.

## 3. Testar

Com o leitor plugado:

```powershell
.\agente-nitgen.exe
```

Noutra janela do PowerShell:

```powershell
curl http://127.0.0.1:9010/status
```

Deve responder `{"disponivel":true,...}`. Encoste o dedo e teste a captura:

```powershell
curl -Method POST http://127.0.0.1:9010/capturar -Body '{}' -ContentType 'application/json'
```

## 4. Ligar no relógio de ponto

No `.env` do sistema:

```
BIOMETRIA_DRIVER=agente
BIOMETRIA_AGENTE_URL=http://127.0.0.1:9010
```

Reinicie o servidor. O painel de **Saúde** deve mostrar o leitor como
disponível, e a tarja amarela de modo de teste some do quiosque.

## 5. Deixar rodando sempre

```powershell
$acao = New-ScheduledTaskAction -Execute "$PWD\agente-nitgen.exe" -WorkingDirectory $PWD
$gatilho = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName 'AgenteBiometrico' -Action $acao -Trigger $gatilho -Force
```

> Aqui o gatilho é **ao fazer logon**, não ao iniciar o sistema: o SDK precisa
> de sessão de usuário para falar com o USB. O servidor do ponto sobe antes,
> ao ligar a máquina; o agente entra quando alguém loga. Se o terminal fica
> ligado com um usuário fixo (o recomendado), isso resolve.

---

## Se a compilação falhar

O código está escrito contra a API padrão do eNBSP, mas **assinaturas mudam
entre versões do SDK**. Os pontos sensíveis estão marcados com `>>> CONFERIR`
dentro de `AgenteNitgen.cs`:

| Ponto | O que costuma variar |
|---|---|
| `OpenDevice()` | algumas versões exigem `OpenDevice(NBioAPI.Type.DEVICE_ID.AUTO)` |
| `Capture(...)` | número e ordem dos parâmetros |
| `VerifyMatch(...)` | sobrecarga para `FIR_TEXTENCODE` |
| qualidade da captura | hoje fixa em 90; dá para ler a real do FIR |

Abra o Claude Code **nesta pasta**, com o SDK já instalado, e peça para
corrigir. Com a DLL presente ele lê as assinaturas reais e ajusta.

## Desempenho

A identificação 1:N é um laço de `VerifyMatch` sobre os cadastrados. Para
dezenas de pessoas isso resolve de sobra — cada comparação é sub-milissegundo.

Passando de umas 200 pessoas, troque pelo `NBioAPI.IndexSearch` do próprio
SDK, que é otimizado em C. A mudança fica contida no método `Identificar`.

## Sobre a "pontuação"

O NBioBSP devolve uma decisão **sim/não**, não uma nota. Quem controla o rigor
é o **nível de segurança** configurado no SDK. Por isso o agente responde
`score: 100` quando casa — e `BIOMETRIA_SCORE_MINIMO` no `.env` do ponto não
tem efeito prático com este leitor. Para apertar ou afrouxar o reconhecimento,
mexa no nível de segurança do SDK, não naquela variável.
