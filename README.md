# tiempos-prompt

Mod para Claude Code que muestra, arriba del prompt, el tiempo total de cada prompt desde que lo enviás hasta que Claude termina, separado en tiempo de Claude, tiempo esperándote (preguntas, permisos, aprobación de planes) y tiempo esperando tareas en segundo plano. No se resetea cuando respondés una pregunta. El comando `/tiempos` muestra el histórico de todos los prompts de la sesión y el total.

## Instalación

En el prompt de una sesión de Claude Code en la terminal:

```
/plugin install tiempos-prompt --marketplace GorritiCamilo/tiempos-prompt
```

Respondé `y` para agregar el marketplace y elegí el scope (user, con Enter).

Desde una shell:

```
claude plugin install tiempos-prompt --marketplace GorritiCamilo/tiempos-prompt
```

En la app de escritorio: + junto al prompt → Plugins → Add marketplace con `GorritiCamilo/tiempos-prompt` → Add plugin.
