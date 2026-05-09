# Fundamento Teórico — Simulador de Gestión de Memoria con Paginación

## 1. El problema de la gestión de memoria

Inicialmente, los programas tenían acceso directo a la memoria física del computador, lo que funcionaba bien cuando solo se ejecutaba una tarea a la vez. El problema surgió cuando se quiso correr múltiples programas al mismo tiempo: si dos procesos intentaban escribir en la misma dirección de memoria, los datos se pisaban y un proceso terminaba corrompiendo al otro. En los sistemas modernos esto es aún más crítico, ya que pueden ejecutarse más de 200 procesos simultáneamente.

Hay otro problema igual de importante: un proceso puede necesitar más memoria de la que físicamente existe en el dispositivo. Por ejemplo, un videojuego puede requerir 16 GB de RAM, pero el computador solo tiene 8 GB.

La solución que implementan los sistemas operativos modernos es la **memoria virtual**: hacerle creer a cada proceso que tiene toda la memoria para sí solo. El SO y el hardware se encargan de traducir las direcciones virtuales que usa el proceso a direcciones físicas reales en la RAM, de forma transparente para el proceso.

---

## 2. Memoria física vs. memoria virtual

La **memoria física** es la RAM del computador: un componente real con una cantidad fija de celdas, cada una con una dirección única. Si el computador tiene 8 GB de RAM, existen exactamente 8.589.934.592 bytes disponibles.

La **memoria virtual** es un espacio de direcciones propio que el SO le asigna a cada proceso. En sistemas de 64 bits, este espacio puede ser de hasta 16 exabytes por proceso, mucho más de lo que cualquier máquina tiene en RAM. Dos procesos pueden tener la misma dirección virtual sin conflicto, porque cada uno tiene su propio espacio separado.

La traducción de direcciones virtuales a físicas la realiza un componente de hardware dentro del procesador llamado **MMU** (*Memory Management Unit*). Esta traducción ocurre en hardware porque sucede en cada acceso a memoria, millones de veces por segundo, por lo que tiene que ser instantánea.

Las **tablas de páginas** son las estructuras que el SO mantiene en RAM para decirle a la MMU a qué dirección física corresponde cada dirección virtual de un proceso. Existe una tabla por proceso, y cuando hay un cambio de contexto, el SO le indica a la MMU cuál tabla usar.

Adicionalmente, la MMU cuenta con una memoria caché interna llamada **TLB** (*Translation Lookaside Buffer*), que almacena las traducciones más recientes para no tener que consultar la tabla de páginas en RAM en cada acceso.

---

## 3. El espacio de direcciones de un proceso

El espacio de direcciones virtual de un proceso no es un bloque vacío: está organizado en regiones con funciones específicas.

- **Código (Text segment):** contiene las instrucciones del programa compilado. Es de solo lectura y tiene permiso de ejecución. Si el proceso intenta escribir aquí, el SO lo termina.
- **Datos (Data/BSS):** almacena variables globales y estáticas. Las que tienen valor inicial asignado van en Data; las que no, el SO las inicializa en cero (BSS).
- **Heap:** memoria dinámica solicitada en tiempo de ejecución (con `malloc` en C, por ejemplo). Crece hacia las direcciones más altas. Si no se libera correctamente, genera un *memory leak*.
- **Stack:** variables locales, parámetros de funciones y direcciones de retorno. Crece hacia las direcciones más bajas. Si se desborda por recursión excesiva, ocurre un *stack overflow*.

Cada región tiene permisos asociados. Por ejemplo, el código tiene permisos de lectura y ejecución pero no de escritura, mientras que el heap y el stack tienen lectura y escritura pero no ejecución. Estos permisos son relevantes para el proyecto, ya que cada página de memoria hereda los permisos de la región a la que pertenece.

---

## 4. Paginación

La paginación es la técnica que usan los sistemas operativos para gestionar la memoria virtual. Resuelve el problema de la **fragmentación externa**: cuando los procesos ocupan bloques de memoria contiguos, eventualmente quedan huecos libres dispersos que individualmente no alcanzan para alojar un nuevo proceso, aunque en total haya espacio suficiente.

La solución consiste en dividir tanto el espacio virtual del proceso como la RAM física en bloques de tamaño fijo:

- Los bloques del espacio virtual se llaman **páginas**.
- Los bloques de la RAM física se llaman **marcos** (*frames*).
- El tamaño estándar es de **4 KB** por página/marco.

La ventaja es que cualquier página puede mapearse a cualquier marco disponible, sin necesidad de que estén en posiciones contiguas. Esto elimina la fragmentación externa.

El mapeo entre páginas y marcos se almacena en la **tabla de páginas**, una estructura en RAM que el SO mantiene por cada proceso. Cada entrada (*Page Table Entry*, PTE) contiene:

- **Número de marco:** en qué posición de la RAM física está la página.
- **Bit de validez:** indica si la página está actualmente en RAM (1) o no (0).
- **Bits de permisos:** R, W, X para esa página.
- **Dirty bit:** indica si la página fue modificada desde que se cargó desde disco. Si es 1, el SO debe escribirla de vuelta al disco antes de descartarla; si es 0, puede descartarla sin escribir nada.

**Traducción de direcciones:** una dirección virtual se divide en dos partes: el *Virtual Page Number* (VPN), que identifica la página, y el *offset*, que es la posición dentro de esa página. La MMU usa el VPN para encontrar el marco correspondiente en la tabla de páginas y construye la dirección física combinando ese marco con el offset, que se mantiene igual. Con páginas de 4 KB, el offset ocupa 12 bits.

---

## 5. Page Faults

Un *page fault* ocurre cuando un proceso intenta acceder a una página que no está en RAM en ese momento. No es un error del programa: es un evento normal que el SO sabe manejar.

El flujo es el siguiente: la MMU revisa el bit de validez de la página en la tabla. Si es 0, lanza una **interrupción de software** al SO. El SO entonces busca la página en el disco, encuentra un marco libre en RAM (o desaloja una página existente usando un algoritmo de reemplazo), carga la página, actualiza la tabla de páginas y reinicia la instrucción que había fallado. El proceso no se entera de nada.

El costo de un *page fault* es significativo: acceder al disco puede ser hasta un millón de veces más lento que acceder a la RAM. Por esta razón, los **algoritmos de reemplazo de páginas** son críticos: determinan qué página sacar de la RAM cuando no hay marcos libres.

Si el SO elige mal y saca páginas que el proceso necesitará pronto, se genera un ciclo continuo de *page faults* conocido como **thrashing**, donde el sistema pasa más tiempo resolviendo fallos que ejecutando trabajo útil.

---

---

## 6. Algoritmos de reemplazo de páginas

Cuando ocurre un page fault y no hay marcos libres en RAM, el SO debe elegir qué página desalojar para hacer espacio. Esta decisión la toma el **algoritmo de reemplazo de páginas**. Una mala elección puede generar otro page fault inmediatamente, degradando el rendimiento del sistema. El objetivo siempre es minimizar la cantidad de page faults.

### FIFO (First In, First Out)

FIFO desaloja la página que lleva más tiempo en RAM, independientemente de si se está usando activamente. Se implementa con una cola: cada página que entra se agrega al final, y la víctima siempre es la del frente.

Su principal debilidad es que no considera el uso reciente de las páginas. Puede desalojar una página que el proceso accede constantemente, solo porque lleva mucho tiempo cargada. Además, FIFO presenta un comportamiento contraintuitivo conocido como la **anomalía de Bélády**: en ciertos casos, aumentar la cantidad de marcos disponibles produce más page faults en lugar de menos. Este fenómeno no ocurre en LRU.

### LRU (Least Recently Used)

LRU desaloja la página que lleva más tiempo sin ser accedida. La lógica es que si una página no se ha usado recientemente, probablemente no se necesite pronto. Es importante distinguir esto de la frecuencia de uso total: una página accedida mil veces pero no en la última hora es candidata a ser desalojada antes que una accedida una sola vez hace unos segundos.

LRU genera menos page faults que FIFO porque toma decisiones basadas en el comportamiento reciente del proceso. Su desventaja es que es más complejo de implementar: requiere rastrear el último acceso de cada página, típicamente con una lista ordenada por recencia. En sistemas reales se usan aproximaciones mediante bits de referencia, ya que LRU exacto tiene un costo de implementación en hardware demasiado alto.

| | FIFO | LRU |
|--|------|-----|
| Criterio | Tiempo en RAM | Último acceso |
| Rendimiento | Menor | Mayor |
| Implementación | Cola simple | Lista por recencia |
| Anomalía de Bélády | Sí | No |

---

## 7. Permisos de memoria

Cada página de memoria tiene asociados bits de permiso que indican qué operaciones puede realizar un proceso sobre ella. Los permisos básicos son lectura (R) y escritura (W). En sistemas reales también existe el permiso de ejecución (X), que controla si las instrucciones de esa página pueden ejecutarse.

Estos permisos se almacenan en la tabla de páginas y la MMU los verifica en cada acceso. Si un proceso intenta escribir en una página con permiso solo de lectura, la MMU lanza una excepción de protección de memoria y el SO termina el proceso o maneja el error. Este mecanismo es fundamental para la seguridad del sistema: previene que código malicioso o bugs modifiquen regiones críticas como el segmento de código.

En el contexto del proyecto, cada página tiene permisos configurados al momento de crear el proceso. El simulador verifica en cada instrucción que la operación solicitada (R o W) sea compatible con los permisos de la página accedida.

---

## 8. TLB — Translation Lookaside Buffer

### El problema que resuelve

Sin ninguna optimización, cada acceso a memoria requiere en realidad dos accesos a la RAM: primero consultar la tabla de páginas para obtener la dirección física, y luego acceder al dato en esa dirección. Esto duplica el costo de cada operación de memoria, lo que es inaceptable para un procesador que ejecuta miles de millones de instrucciones por segundo.

### Qué es el TLB

El TLB es una memoria caché pequeña y extremadamente rápida ubicada dentro de la MMU. Almacena las traducciones de direcciones más recientes — pares VPN → marco físico — para no tener que consultar la tabla de páginas en cada acceso. Su tamaño típico es de 64 a 1024 entradas.

A pesar de ser tan pequeño, el TLB es altamente efectivo gracias al **principio de localidad**: los programas tienden a acceder repetidamente a las mismas páginas en períodos cortos de tiempo. Por ejemplo, las instrucciones de un bucle acceden siempre a las mismas páginas de código. En sistemas bien diseñados, la tasa de aciertos del TLB supera el 99%.

### TLB hit y TLB miss

Cuando la MMU busca una traducción en el TLB y la encuentra, se llama **TLB hit**: la dirección física se obtiene en aproximadamente un ciclo, sin acceder a la tabla de páginas. Cuando no la encuentra, se llama **TLB miss**: el SO debe consultar la tabla de páginas en RAM, lo que agrega un acceso extra. La traducción se guarda en el TLB para futuros accesos.

Si además la página no está en RAM (bit de validez = 0), ocurre un page fault después del TLB miss, siguiendo el flujo descrito en la sección anterior.

### Reemplazo en el TLB

Cuando el TLB está lleno y llega una nueva traducción, debe desalojar una entrada existente. Típicamente se usa LRU: se descarta la traducción que lleva más tiempo sin ser accedida.

### Context switch y TLB flush

Cuando el SO realiza un cambio de contexto — cambia el proceso en ejecución — las entradas del TLB del proceso anterior son inválidas para el nuevo proceso, ya que cada proceso tiene su propio espacio de direcciones. La solución más simple es el **TLB flush**: borrar todas las entradas al cambiar de proceso. Esto es simple pero costoso, ya que el nuevo proceso empieza con el TLB vacío y genera muchos misses iniciales.

Una alternativa más eficiente es el uso de **ASID** (*Address Space Identifier*): etiquetar cada entrada del TLB con el identificador del proceso al que pertenece, permitiendo que traducciones de múltiples procesos coexistan en el TLB sin conflicto.

### Métricas del TLB

El rendimiento del TLB se mide con las siguientes métricas:

- **TLB hits:** cantidad de traducciones resueltas desde el TLB.
- **TLB misses:** cantidad de traducciones que requirieron consultar la tabla de páginas.
- **Hit rate:** `hits / (hits + misses) × 100%` — el indicador principal de eficiencia.
- **Penalización por miss:** ciclos extra que cuesta cada miss respecto a un hit.

Estas métricas permiten observar cómo distintos patrones de acceso a memoria afectan el rendimiento del sistema, y justifican la importancia del TLB como optimización fundamental en cualquier arquitectura moderna.
