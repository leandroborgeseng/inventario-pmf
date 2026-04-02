'use strict';

/**
 * Texto em português a partir de data_aquisicao (YYYY-MM-DD).
 */
function idadeAquisicaoDeISO(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';

  const inicio = new Date(y, mo - 1, d);
  const hoje = new Date();
  inicio.setHours(0, 0, 0, 0);
  hoje.setHours(0, 0, 0, 0);
  if (inicio > hoje) return 'Data futura';

  let anos = hoje.getFullYear() - inicio.getFullYear();
  let meses = hoje.getMonth() - inicio.getMonth();
  if (hoje.getDate() < inicio.getDate()) meses--;
  if (meses < 0) {
    anos--;
    meses += 12;
  }
  if (anos < 0) return '';

  if (anos === 0 && meses === 0) return 'Menos de 1 mês';
  if (anos === 0) return meses === 1 ? '1 mês' : `${meses} meses`;
  if (meses === 0) return anos === 1 ? '1 ano' : `${anos} anos`;
  return `${anos} ${anos === 1 ? 'ano' : 'anos'} e ${meses} ${
    meses === 1 ? 'mês' : 'meses'
  }`;
}

module.exports = { idadeAquisicaoDeISO };
