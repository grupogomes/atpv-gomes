/**
 * Termo de consentimento para tratamento de dado biometrico.
 *
 * A LGPD (Lei 13.709/2018) classifica biometria como dado pessoal SENSIVEL
 * (art. 5º, II). O tratamento depende de base legal do art. 11 — aqui a
 * combinacao usual e: consentimento especifico e destacado do titular
 * (art. 11, I) somado ao cumprimento de obrigacao legal do controlador
 * (art. 11, II, "a"), que e o controle de jornada do art. 74 da CLT.
 *
 * O texto e versionado e seu hash fica guardado junto do consentimento, para
 * que anos depois se saiba exatamente O QUE a pessoa aceitou.
 */
export const TERMO_BIOMETRIA = {
  versao: '1.0',
  texto: `TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADO BIOMETRICO

1. FINALIDADE
A empresa utiliza a leitura da impressao digital exclusivamente para
identificar o trabalhador no momento do registro eletronico de jornada,
cumprindo o art. 74 da CLT e a Portaria MTP nº 671/2021.

2. O QUE E COLETADO
Nao e armazenada a imagem da sua digital. O leitor converte a digital em um
"template": um conjunto de numeros que descreve pontos caracteristicos e do
qual nao se reconstroi a imagem original. Esse template e guardado cifrado.

3. O QUE NAO E FEITO
O dado biometrico nao e usado para controle de produtividade, nao alimenta
sistema de reconhecimento facial ou de vigilancia, nao e compartilhado com
terceiros e nao e transferido para fora do pais.

4. POR QUANTO TEMPO
O template e mantido enquanto durar o contrato de trabalho e eliminado em ate
30 dias apos o desligamento. As MARCACOES DE PONTO, por serem obrigacao legal,
sao guardadas por 5 anos (art. 7º, XXIX, da Constituicao Federal), mas elas
nao contem dado biometrico: guardam apenas CPF, data e hora.

5. ALTERNATIVA
Voce pode recusar o uso da biometria. Nesse caso sera fornecida credencial
alternativa de identificacao, sem qualquer prejuizo, penalidade ou tratamento
diferenciado.

6. SEUS DIREITOS
A qualquer momento voce pode confirmar a existencia do tratamento, acessar os
dados, corrigi-los, revogar este consentimento e pedir a eliminacao do
template biometrico (arts. 9º e 18 da Lei 13.709/2018 - LGPD). O pedido pode
ser feito ao encarregado de dados da empresa e sera atendido sem custo.

7. COMPROVANTES
A cada marcacao voce recebe um comprovante com o numero sequencial do registro
(NSR) e um codigo de autenticidade. Guarde-os: sao a sua prova independente do
horario registrado.

Declaro que li, entendi e concordo com o tratamento do meu dado biometrico
para a finalidade acima.`
};
