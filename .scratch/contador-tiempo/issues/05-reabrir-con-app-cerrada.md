# 05: Reabrir con la app cerrada — tramo por tiempo de pared

**What to build:** si el usuario cierra la app con el Contador en marcha, al reabrir el tiempo transcurrido con ella cerrada le espera como Tramo pendiente prefillado. En el boot (composition root), si el Doc trae el ancla de un Contador en marcha, se calcula el tiempo de pared transcurrido («ahora − instante de inicio»), se deshace el ancla y el resultado queda como Tramo pendiente en la Jugada anclada, revisable como cualquier otro. Sin tope ni corrección: el usuario revisa y decide; ningún límite «de sensatez» muta sus datos.

**Blocked by:** 03 (Motor del Contador: iniciar y pausar).

**Status:** ready-for-agent

- [x] Boot con ancla → Tramo pendiente con el tiempo de pared y ancla deshecha
- [x] Boot sin ancla no toca nada
- [x] Verificado sembrando el Doc con el ancla y reinicializando la biblioteca con un `now` posterior (sin navegador)
- [x] Sin tope: un tramo de días queda tal cual para revisión
