import { config } from '../config.js';
import { criarSimulador } from './simulador.js';
import { criarDriverAgente } from './agente.js';

let driverAtual = null;

/** Devolve o driver biometrico configurado (singleton). */
export function driver() {
  if (!driverAtual) {
    driverAtual = config.biometria.driver === 'agente'
      ? criarDriverAgente()
      : criarSimulador();
  }
  return driverAtual;
}

/** Troca o driver — usado nos testes e na troca de leitor sem reiniciar. */
export function definirDriver(novo) {
  driverAtual = novo;
}
