'use strict';

/**
 * Limite de falhas por IP (janela deslizante). Sucesso limpa o contador.
 */
function createFailLimiter({ maxFails, windowMs }) {
  const map = new Map();

  function freshEntry() {
    return { fails: 0, since: Date.now() };
  }

  function getEntry(ip) {
    const now = Date.now();
    let e = map.get(ip);
    if (!e || now - e.since >= windowMs) {
      e = freshEntry();
      map.set(ip, e);
    }
    return e;
  }

  return {
    isBlocked(ip) {
      const e = map.get(ip);
      if (!e) return false;
      if (Date.now() - e.since >= windowMs) {
        map.delete(ip);
        return false;
      }
      return e.fails >= maxFails;
    },
    recordFailure(ip) {
      const e = getEntry(ip);
      e.fails += 1;
    },
    recordSuccess(ip) {
      map.delete(ip);
    },
  };
}

module.exports = { createFailLimiter };
