import TABELA_HAWKINS from './tabela-referencia.js';

function avaliarEstado(latencia, estabilidadeVoz) {
    // Lógica Elayon: 
    // Alta latência (demora pra falar) puxa pra baixo na tabela.
    // Voz estável e fluida puxa pra cima.
    
    let scoreCalculado = (1000 - (latencia * 100)) * (estabilidadeVoz / 100);
    
    // Encontra o nível mais próximo na tabela de Hawkins
    const resultado = TABELA_HAWKINS.reduce((prev, curr) => {
        return (Math.abs(curr.freq - scoreCalculado) < Math.abs(prev.freq - scoreCalculado) ? curr : prev);
    });

    return resultado;
}
