// ===========================================================================
// Agente biometrico para leitores NITGEN (Hamster DX, Hamster III, Hamster II)
//
// Roda no computador onde o leitor USB esta plugado, escuta em 127.0.0.1:9010
// e traduz o protocolo do REP-P (ver ..\PROTOCOLO.md) para o eNBSP SDK.
//
// Compilar (nao precisa de Visual Studio; o csc ja vem com o Windows):
//     .\compilar.ps1
//
// Requisitos:
//   - eNBSP SDK da Nitgen instalado (NITGEN.SDK.NBioBSP.dll e NBioBSP.dll)
//   - .NET Framework 3.5 ou superior
//
// PONTOS A CONFERIR na primeira execucao com o leitor em maos estao marcados
// com  // >>> CONFERIR  — sao os lugares onde a assinatura exata do SDK pode
// variar entre versoes. O resto e protocolo puro e nao depende do SDK.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;
using NITGEN.SDK.NBioBSP;

class AgenteNitgen
{
    static NBioAPI api;
    static readonly object trava = new object();   // o SDK nao e reentrante
    static string modelo = "NITGEN";
    static bool dispositivoAberto = false;

    // Modo convivencia (padrao). O eNBSP abre o leitor em modo EXCLUSIVO:
    // enquanto o agente o mantiver aberto, nenhum outro programa consegue
    // usa-lo. Como o mesmo leitor costuma servir a outro sistema da empresa,
    // por padrao abrimos so durante a captura e soltamos logo depois.
    // Com --segurar-leitor o agente mantem aberto (captura um pouco mais
    // rapida, mas o leitor fica cativo).
    static bool segurarLeitor = false;

    // Tempo maximo, em milissegundos, que o leitor fica esperando um dedo.
    const int TimeoutPadrao = 20000;

    static int Main(string[] args)
    {
        int porta = 9010;
        foreach (string a in args)
        {
            if (a.StartsWith("--porta=")) int.TryParse(a.Substring(8), out porta);
            if (a == "--segurar-leitor") segurarLeitor = true;
        }

        Console.WriteLine("Agente biometrico NITGEN");

        // Abre uma vez so para dizer se o leitor existe, e solta em seguida.
        bool achou = AbrirLeitor();
        if (!segurarLeitor) LiberarLeitor();
        if (!achou)
            Console.WriteLine("  ATENCAO: leitor nao encontrado. O agente sobe assim mesmo");
        Console.WriteLine("  e tenta reabrir a cada requisicao (util se o USB cair).");

        HttpListener servidor = new HttpListener();
        // Somente localhost: o agente nao tem autenticacao e depende disso.
        servidor.Prefixes.Add("http://127.0.0.1:" + porta + "/");
        try { servidor.Start(); }
        catch (Exception e)
        {
            Console.WriteLine("Nao foi possivel escutar na porta " + porta + ": " + e.Message);
            Console.WriteLine("Rode como administrador ou libere a porta.");
            return 1;
        }

        Console.WriteLine("  no ar em http://127.0.0.1:" + porta);
        Console.WriteLine("  leitor: " + modelo + (achou ? " (pronto)" : " (ausente)"));
        Console.WriteLine(segurarLeitor
            ? "  modo: leitor CATIVO — outro programa nao vai conseguir usa-lo"
            : "  modo: convivencia — o leitor so fica ocupado durante a captura");
        Console.WriteLine("  Ctrl+C encerra.");

        while (servidor.IsListening)
        {
            try { Atender(servidor.GetContext()); }
            catch (Exception e) { Console.WriteLine("[erro] " + e.Message); }
        }
        return 0;
    }

    // -----------------------------------------------------------------------
    // Dispositivo
    // -----------------------------------------------------------------------

    static bool AbrirLeitor()
    {
        lock (trava)
        {
            if (dispositivoAberto) return true;
            try
            {
                if (api == null) api = new NBioAPI();
                // >>> CONFERIR: em algumas versoes e OpenDevice(DEVICE_ID.AUTO).
                uint r = api.OpenDevice();
                dispositivoAberto = (r == NBioAPI.Error.NONE);
                if (dispositivoAberto) modelo = "NITGEN Hamster";
                return dispositivoAberto;
            }
            catch (Exception e)
            {
                Console.WriteLine("[leitor] " + e.Message);
                dispositivoAberto = false;
                return false;
            }
        }
    }

    /// <summary>
    /// Solta o leitor para que outro programa possa usa-lo. Sem isto, o
    /// sistema de vistoria (ou qualquer outro que fale com o mesmo aparelho)
    /// fica sem leitor enquanto o agente estiver no ar.
    /// </summary>
    static void LiberarLeitor()
    {
        lock (trava)
        {
            if (!dispositivoAberto) return;
            // >>> CONFERIR: em algumas versoes e CloseDevice(DEVICE_ID.AUTO).
            try { api.CloseDevice(); } catch (Exception e) { Console.WriteLine("[leitor] " + e.Message); }
            dispositivoAberto = false;
        }
    }

    /// <summary>
    /// Garante o objeto do SDK sem abrir o aparelho. A comparacao de
    /// digitais (VerifyMatch) e feita em memoria e nao precisa do leitor.
    /// </summary>
    static bool GarantirApi()
    {
        lock (trava)
        {
            try { if (api == null) api = new NBioAPI(); return true; }
            catch (Exception e) { Console.WriteLine("[sdk] " + e.Message); return false; }
        }
    }

    /// <summary>
    /// Diz se ha leitor plugado SEM tomar posse dele. O quiosque consulta
    /// isto a cada 20 segundos; se abrissemos o aparelho a cada consulta,
    /// brigariamos o dia inteiro com o outro programa.
    /// </summary>
    static bool LeitorPresente()
    {
        lock (trava)
        {
            if (dispositivoAberto) return true;
            if (!GarantirApi()) return false;
            try
            {
                // >>> CONFERIR: nome e assinatura de EnumerateDevice variam
                // entre versoes. Enumerar NAO abre o aparelho.
                NBioAPI.Type.DEVICE_ID[] lista;
                int quantos;
                uint r = api.EnumerateDevice(out quantos, out lista);
                return (r == NBioAPI.Error.NONE && quantos > 0);
            }
            catch (Exception)
            {
                // Sem enumeracao disponivel, so resta abrir e soltar.
                bool abriu = AbrirLeitor();
                if (abriu && !segurarLeitor) LiberarLeitor();
                return abriu;
            }
        }
    }

    // -----------------------------------------------------------------------
    // Rotas
    // -----------------------------------------------------------------------

    static void Atender(HttpListenerContext ctx)
    {
        string rota = ctx.Request.Url.AbsolutePath;
        string metodo = ctx.Request.HttpMethod;

        if (metodo == "GET" && rota == "/status") { Status(ctx); return; }
        if (metodo == "POST" && rota == "/capturar") { Capturar(ctx); return; }
        if (metodo == "POST" && rota == "/identificar") { Identificar(ctx); return; }

        Responder(ctx, 404, "{\"erro\":\"rota desconhecida\"}");
    }

    static void Status(HttpListenerContext ctx)
    {
        bool pronto = LeitorPresente();
        Responder(ctx, 200, "{"
            + "\"disponivel\":" + (pronto ? "true" : "false") + ","
            + "\"modelo\":" + Json(modelo) + ","
            + "\"detalhe\":" + Json(pronto
                ? (segurarLeitor ? "eNBSP SDK (leitor cativo)" : "eNBSP SDK (livre entre capturas)")
                : "leitor nao encontrado")
            + "}");
    }

    static void Capturar(HttpListenerContext ctx)
    {
        if (!AbrirLeitor())
        {
            Responder(ctx, 200, "{\"template\":null,\"erro\":\"leitor indisponivel\"}");
            return;
        }

        Dictionary<string, object> corpo = LerJson(ctx);
        int timeout = TimeoutPadrao;
        if (corpo != null && corpo.ContainsKey("timeoutMs"))
            int.TryParse(Convert.ToString(corpo["timeoutMs"]), out timeout);

        lock (trava)
        {
            NBioAPI.Type.HFIR hFIR = null;
            try
            {
                // >>> CONFERIR: a assinatura de Capture varia entre versoes do SDK.
                uint r = api.Capture(NBioAPI.Type.FIR_PURPOSE.VERIFY, out hFIR, timeout, null, null);
                if (r != NBioAPI.Error.NONE || hFIR == null)
                {
                    Responder(ctx, 200, "{\"template\":null,\"erro\":" + Json(Erro(r)) + "}");
                    return;
                }

                NBioAPI.Type.FIR_TEXTENCODE texto;
                r = api.GetTextFIRFromHandle(hFIR, out texto, true);
                if (r != NBioAPI.Error.NONE)
                {
                    Responder(ctx, 200, "{\"template\":null,\"erro\":" + Json(Erro(r)) + "}");
                    return;
                }

                // O template viaja em base64 do texto do FIR. O REP-P guarda
                // esses bytes cifrados e devolve iguais na identificacao.
                string base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(texto.TextFIR));

                Responder(ctx, 200, "{"
                    + "\"template\":" + Json(base64) + ","
                    + "\"qualidade\":90,"          // >>> CONFERIR: ler a qualidade real do FIR
                    + "\"modelo\":" + Json(modelo)
                    + "}");
            }
            finally
            {
                if (hFIR != null) { try { api.FreeFIRHandle(hFIR); } catch { } }
                // Devolve o leitor a quem mais precisar dele.
                if (!segurarLeitor) LiberarLeitor();
            }
        }
    }

    static void Identificar(HttpListenerContext ctx)
    {
        // Aqui so comparamos templates ja capturados: e conta em memoria.
        // Nao abrimos o leitor, para nao disputa-lo com o outro programa.
        if (!GarantirApi())
        {
            Responder(ctx, 200, "{\"encontrado\":false,\"erro\":\"SDK indisponivel\"}");
            return;
        }

        Dictionary<string, object> corpo = LerJson(ctx);
        if (corpo == null || !corpo.ContainsKey("template"))
        {
            Responder(ctx, 400, "{\"erro\":\"template ausente\"}");
            return;
        }

        string capturadoTexto = Encoding.UTF8.GetString(
            Convert.FromBase64String(Convert.ToString(corpo["template"])));

        object bruto;
        corpo.TryGetValue("candidatos", out bruto);
        object[] candidatos = bruto as object[];
        if (candidatos == null)
        {
            Responder(ctx, 200, "{\"encontrado\":false}");
            return;
        }

        lock (trava)
        {
            NBioAPI.Type.FIR_TEXTENCODE capturado = new NBioAPI.Type.FIR_TEXTENCODE();
            capturado.TextFIR = capturadoTexto;

            // Comparacao 1:N por laco. Para dezenas de pessoas isso resolve de
            // sobra. Passando de umas 200, troque pelo IndexSearch do proprio
            // SDK, que e otimizado em C — ver nitgen\README.md.
            foreach (object item in candidatos)
            {
                Dictionary<string, object> c = item as Dictionary<string, object>;
                if (c == null || !c.ContainsKey("template")) continue;

                NBioAPI.Type.FIR_TEXTENCODE guardado = new NBioAPI.Type.FIR_TEXTENCODE();
                guardado.TextFIR = Encoding.UTF8.GetString(
                    Convert.FromBase64String(Convert.ToString(c["template"])));

                bool casou = false;
                try
                {
                    // >>> CONFERIR: overload de VerifyMatch para FIR_TEXTENCODE.
                    uint r = api.VerifyMatch(capturado, guardado, out casou, null);
                    if (r != NBioAPI.Error.NONE) casou = false;
                }
                catch { casou = false; }

                if (casou)
                {
                    // O NBioBSP decide sim/nao pelo nivel de seguranca do
                    // proprio SDK; nao devolve pontuacao. Por isso 100.
                    Responder(ctx, 200, "{"
                        + "\"encontrado\":true,"
                        + "\"id\":" + Convert.ToString(c["id"]) + ","
                        + "\"score\":100,"
                        + "\"modelo\":" + Json(modelo)
                        + "}");
                    return;
                }
            }
        }

        Responder(ctx, 200, "{\"encontrado\":false}");
    }

    // -----------------------------------------------------------------------
    // Utilidades
    // -----------------------------------------------------------------------

    static Dictionary<string, object> LerJson(HttpListenerContext ctx)
    {
        try
        {
            using (StreamReader r = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
            {
                string texto = r.ReadToEnd();
                if (string.IsNullOrEmpty(texto)) return new Dictionary<string, object>();
                JavaScriptSerializer js = new JavaScriptSerializer();
                js.MaxJsonLength = int.MaxValue;   // a lista de candidatos cresce
                return js.Deserialize<Dictionary<string, object>>(texto);
            }
        }
        catch { return null; }
    }

    static void Responder(HttpListenerContext ctx, int status, string json)
    {
        byte[] dados = Encoding.UTF8.GetBytes(json);
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "application/json; charset=utf-8";
        ctx.Response.ContentLength64 = dados.Length;
        ctx.Response.OutputStream.Write(dados, 0, dados.Length);
        ctx.Response.OutputStream.Close();
    }

    static string Json(string valor)
    {
        if (valor == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        foreach (char c in valor)
        {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c == '\n') sb.Append("\\n");
            else if (c == '\r') sb.Append("\\r");
            else if (c == '\t') sb.Append("\\t");
            else if (c < 32) sb.Append("\\u").Append(((int)c).ToString("x4"));
            else sb.Append(c);
        }
        return sb.Append('"').ToString();
    }

    static string Erro(uint codigo)
    {
        if (codigo == NBioAPI.Error.CAPTURE_TIMEOUT) return "tempo esgotado: nenhum dedo apresentado";
        if (codigo == NBioAPI.Error.DEVICE_NOT_OPENED) return "leitor nao esta aberto";
        if (codigo == NBioAPI.Error.USER_CANCEL) return "captura cancelada";
        return "falha na captura (codigo " + codigo + ")";
    }
}
