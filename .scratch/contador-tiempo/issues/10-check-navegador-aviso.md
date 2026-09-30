# 10 (opcional): Comprobación con navegador — aviso vivo y sobreviviente

**What to build:** lo que jsdom no alcanza: un script de comprobación al estilo de los `check-*` existentes (Edge headless contra un dev server) que verifica el aviso de contador en navegador real: visible en las tres pestañas con el Contador en marcha y sobreviviente a una recarga real (tras recargar, el tiempo transcurrido pasa a Tramo pendiente y el aviso lo señala). Es un añadido voluntario, no parte del mínimo del feature.

**Blocked by:** 08 (Aviso de contador en todas las pantallas).

**Status:** ready-for-agent

- [x] Script en la familia `check-*` corre contra dev server con Edge headless
- [x] Aviso visible en las tres pestañas con Contador en marcha
- [x] Tras recarga real, el aviso señala el Tramo pendiente (tiempo de pared)
