-- ===========================================================================
-- REP-P — esquema do banco
--
-- Principio central: a tabela `registro` e um livro-razao APPEND-ONLY com
-- cadeia de hash. Marcacoes de ponto entram nela e nunca sao alteradas nem
-- excluidas — a Portaria MTP 671/2021 veda qualquer alteracao ou exclusao de
-- marcacao registrada. Correcoes de jornada existem, mas vivem em `tratamento`
-- e preservam integralmente o registro original (e assim que o AEJ funciona).
-- ===========================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- --------------------------------------------------------------------------
-- Livro-razao imutavel. Um unico NSR (Numero Sequencial de Registro)
-- monotonico e compartilhado por todos os tipos de registro, como no AFD.
--   tipo '2' = inclusao/alteracao de empregador
--   tipo '4' = ajuste do relogio
--   tipo '5' = inclusao/alteracao/exclusao de empregado
--   tipo '6' = evento sensivel do REP
--   tipo '7' = marcacao de ponto (REP-P)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registro (
  nsr           INTEGER PRIMARY KEY,          -- sequencial, nunca reutilizado
  tipo          TEXT    NOT NULL CHECK (tipo IN ('2','4','5','6','7')),
  dh            TEXT    NOT NULL,             -- data/hora do fato (ISO com fuso)
  dh_gravacao   TEXT    NOT NULL,             -- data/hora da gravacao no REP-P
  conteudo      TEXT    NOT NULL,             -- JSON canonico do registro
  hash_anterior TEXT    NOT NULL,             -- encadeamento
  hash          TEXT    NOT NULL UNIQUE,      -- SHA-256 deste registro
  cpf           TEXT GENERATED ALWAYS AS (json_extract(conteudo, '$.cpf')) VIRTUAL,
  posto_id      TEXT GENERATED ALWAYS AS (json_extract(conteudo, '$.postoId')) VIRTUAL
);

CREATE INDEX IF NOT EXISTS idx_registro_tipo_dh ON registro (tipo, dh);
CREATE INDEX IF NOT EXISTS idx_registro_cpf_dh  ON registro (cpf, dh);

-- Imutabilidade imposta pelo proprio banco, nao so pela aplicacao.
CREATE TRIGGER IF NOT EXISTS registro_imutavel_update
BEFORE UPDATE ON registro
BEGIN
  SELECT RAISE(ABORT, 'Registro de ponto e imutavel (Portaria MTP 671/2021)');
END;

CREATE TRIGGER IF NOT EXISTS registro_imutavel_delete
BEFORE DELETE ON registro
BEGIN
  SELECT RAISE(ABORT, 'Registro de ponto nao pode ser excluido (Portaria MTP 671/2021)');
END;

-- --------------------------------------------------------------------------
-- Cadastro do empregador (estado corrente; o historico fica em `registro`)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empregador (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  tipo_identificador INTEGER NOT NULL,        -- 1 = CNPJ, 2 = CPF
  documento          TEXT    NOT NULL,
  cno_caepf          TEXT    NOT NULL DEFAULT '',
  razao_social       TEXT    NOT NULL,
  endereco           TEXT    NOT NULL DEFAULT '',
  atualizado_em      TEXT    NOT NULL
);

-- --------------------------------------------------------------------------
-- Trabalhadores
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trabalhador (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  cpf            TEXT    NOT NULL UNIQUE,
  nome           TEXT    NOT NULL,
  matricula      TEXT    NOT NULL DEFAULT '',
  cargo          TEXT    NOT NULL DEFAULT '',
  admissao       TEXT,                        -- AAAA-MM-DD
  demissao       TEXT,
  ativo          INTEGER NOT NULL DEFAULT 1,
  -- Isento de controle de jornada (CLT art. 62). Se 1, nao gera espelho.
  isento_jornada INTEGER NOT NULL DEFAULT 0,
  criado_em      TEXT    NOT NULL,
  atualizado_em  TEXT    NOT NULL
);

-- --------------------------------------------------------------------------
-- Escala contratual — base para o espelho de ponto e para o AEJ.
-- dia_semana: 0 = domingo ... 6 = sabado
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escala (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  trabalhador_id  INTEGER NOT NULL REFERENCES trabalhador(id) ON DELETE CASCADE,
  vigencia_inicio TEXT    NOT NULL,
  vigencia_fim    TEXT,
  dia_semana      INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  entrada         TEXT,                        -- HH:MM
  saida           TEXT,
  intervalo_min   INTEGER NOT NULL DEFAULT 0,  -- minutos de intervalo previsto
  UNIQUE (trabalhador_id, vigencia_inicio, dia_semana)
);

-- --------------------------------------------------------------------------
-- Biometria. Guardamos TEMPLATE (vetor matematico irreversivel do leitor),
-- cifrado com AES-256-GCM. Nunca a imagem da digital — minimizacao exigida
-- pela LGPD (art. 6, III) para dado pessoal sensivel (art. 5, II).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biometria (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  trabalhador_id INTEGER NOT NULL REFERENCES trabalhador(id) ON DELETE CASCADE,
  dedo           TEXT    NOT NULL,             -- ex.: 'polegar_direito'
  template_cifr  BLOB    NOT NULL,             -- iv || tag || ciphertext
  qualidade      INTEGER NOT NULL DEFAULT 0,
  leitor_modelo  TEXT    NOT NULL DEFAULT '',
  criado_em      TEXT    NOT NULL,
  revogado_em    TEXT,
  UNIQUE (trabalhador_id, dedo)
);

-- --------------------------------------------------------------------------
-- Consentimento / informacao ao titular (LGPD arts. 9 e 11)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consentimento (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  trabalhador_id INTEGER NOT NULL REFERENCES trabalhador(id) ON DELETE CASCADE,
  versao_termo   TEXT    NOT NULL,
  hash_termo     TEXT    NOT NULL,             -- SHA-256 do texto aceito
  finalidade     TEXT    NOT NULL,
  concedido_em   TEXT    NOT NULL,
  revogado_em    TEXT,
  registrado_por TEXT    NOT NULL DEFAULT ''
);

-- --------------------------------------------------------------------------
-- Postos (terminais autorizados a registrar ponto).
-- Marcacao so e aceita de um posto provisionado, com token valido e vindo de
-- rede autorizada. E o que impede marcacao remota pelo celular.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posto (
  id            TEXT PRIMARY KEY,              -- ex.: 'RECEPCAO-01'
  nome          TEXT NOT NULL,
  token_hash    TEXT NOT NULL,                 -- scrypt do token do posto
  token_salt    TEXT NOT NULL,
  local         TEXT NOT NULL DEFAULT '',
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL,
  ultimo_uso_em TEXT
);

-- --------------------------------------------------------------------------
-- Tratamento de jornada (base do AEJ). NAO altera a marcacao original:
-- guarda a marcacao considerada, o motivo e quem tratou.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tratamento (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  trabalhador_id INTEGER NOT NULL REFERENCES trabalhador(id),
  data           TEXT    NOT NULL,             -- AAAA-MM-DD da jornada
  nsr_origem     INTEGER REFERENCES registro(nsr),
  tipo           TEXT    NOT NULL,             -- 'inclusao','desconsideracao','justificativa'
  dh_considerada TEXT,                         -- marcacao incluida manualmente
  motivo         TEXT    NOT NULL,
  autorizado_por TEXT    NOT NULL,
  criado_em      TEXT    NOT NULL
);

-- --------------------------------------------------------------------------
-- Usuarios administrativos (RH / gestor). NAO batem ponto por aqui.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuario (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  login       TEXT    NOT NULL UNIQUE,
  nome        TEXT    NOT NULL,
  senha_hash  TEXT    NOT NULL,
  senha_salt  TEXT    NOT NULL,
  papel       TEXT    NOT NULL CHECK (papel IN ('admin','rh','supervisor')),
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS sessao (
  token      TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  criado_em  TEXT NOT NULL,
  expira_em  TEXT NOT NULL
);

-- --------------------------------------------------------------------------
-- Auditoria de tudo que nao e marcacao: logins, exportacoes de AFD, cadastro
-- e revogacao de biometria, uso de credencial alternativa, tratamentos.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  dh        TEXT NOT NULL,
  ator      TEXT NOT NULL,
  acao      TEXT NOT NULL,
  alvo      TEXT NOT NULL DEFAULT '',
  detalhe   TEXT NOT NULL DEFAULT '',
  origem_ip TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_auditoria_dh ON auditoria (dh);

-- --------------------------------------------------------------------------
-- Exportacoes de AFD/AEJ ja emitidas (rastreabilidade fiscal)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exportacao (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo        TEXT NOT NULL CHECK (tipo IN ('AFD','AEJ')),
  inicio      TEXT NOT NULL,
  fim         TEXT NOT NULL,
  nsr_inicial INTEGER,
  nsr_final   INTEGER,
  arquivo     TEXT NOT NULL,
  sha256      TEXT NOT NULL,
  gerado_por  TEXT NOT NULL,
  gerado_em   TEXT NOT NULL
);

-- --------------------------------------------------------------------------
-- Sessao de leitura do trabalhador no portal. E aberta pelo proprio dedo, no
-- quiosque, e vale poucos minutos. Deliberadamente NAO existe senha de
-- trabalhador: menos credencial circulando, menos chance de emprestar acesso.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessao_trabalhador (
  token          TEXT PRIMARY KEY,
  trabalhador_id INTEGER NOT NULL REFERENCES trabalhador(id) ON DELETE CASCADE,
  criado_em      TEXT NOT NULL,
  expira_em      TEXT NOT NULL
);

-- --------------------------------------------------------------------------
-- Atestados (dias inteiros e horas)
--
-- O atestado ABONA a ausencia: nao apaga nem cria marcacao. Ele entra na
-- apuracao cobrindo exatamente o que faltou para fechar a jornada prevista,
-- nunca mais que isso — um atestado nunca vira hora extra.
--
-- LGPD: o CID e dado de saude, portanto dado pessoal sensivel (art. 5, II).
-- Informa-lo e faculdade do trabalhador (sigilo medico), por isso o campo e
-- opcional, fica cifrado, e cada leitura vai para a auditoria.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atestado (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  trabalhador_id INTEGER NOT NULL REFERENCES trabalhador(id) ON DELETE CASCADE,
  tipo           TEXT    NOT NULL CHECK (tipo IN ('dias','horas')),
  natureza       TEXT    NOT NULL,
  -- 'abona'     = justifica E nao desconta do salario
  -- 'justifica' = justifica a ausencia, mas as horas sao descontadas
  efeito         TEXT    NOT NULL DEFAULT 'abona' CHECK (efeito IN ('abona','justifica')),
  motivo_efeito  TEXT    NOT NULL DEFAULT '',   -- preenchido ao sobrepor o padrao legal
  data_inicio    TEXT    NOT NULL,            -- AAAA-MM-DD
  data_fim       TEXT    NOT NULL,            -- = data_inicio quando tipo='horas'
  hora_inicio    TEXT,                        -- HH:MM, so quando tipo='horas'
  hora_fim       TEXT,
  dias           INTEGER NOT NULL DEFAULT 0,  -- dias corridos abrangidos
  minutos        INTEGER NOT NULL DEFAULT 0,  -- minutos abrangidos (tipo='horas')
  emitente       TEXT    NOT NULL DEFAULT '',
  conselho       TEXT    NOT NULL DEFAULT '', -- CRM/CRO do profissional
  cid_cifr       BLOB,                        -- opcional e cifrado (AES-256-GCM)
  observacao     TEXT    NOT NULL DEFAULT '',
  arquivo        TEXT,                        -- caminho do documento digitalizado
  situacao       TEXT    NOT NULL DEFAULT 'pendente'
                 CHECK (situacao IN ('pendente','aceito','recusado')),
  motivo_recusa  TEXT,
  entregue_em    TEXT,                        -- quando o papel chegou ao RH
  registrado_por TEXT    NOT NULL,
  registrado_em  TEXT    NOT NULL,
  avaliado_por   TEXT,
  avaliado_em    TEXT
);

CREATE INDEX IF NOT EXISTS idx_atestado_trab ON atestado (trabalhador_id, data_inicio);
CREATE INDEX IF NOT EXISTS idx_atestado_periodo ON atestado (data_inicio, data_fim);
