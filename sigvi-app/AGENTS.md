# AGENTS.md — Especificación Técnica del Proyecto SIGVI Minorista

Eres un ingeniero de software senior construyendo el prototipo funcional del **Sistema de Gestión de Ventas e Inventario para Negocios Minoristas (SIGVI)**. Todo el código que generes debe respetar estrictamente las especificaciones de análisis y diseño ubicadas en la carpeta `docs/` (`datos.md`, `minispecs.md`, `diseno.md` y `dte_generado.md`).

---

## 1. Stack Tecnológico y Reglas de Arquitectura

- **Framework:** Next.js (App Router) con TypeScript y Tailwind CSS (`src/app/`).
- **Base de Datos:** PostgreSQL alojado en **Supabase**, utilizando `@supabase/supabase-js`.
- **Seguridad y Arquitectura Cliente-Servidor (OBLIGATORIO):**
  - **TODA** conexión y consulta a Supabase debe ejecutarse **exclusivamente del lado del servidor** (`src/lib/supabaseServer.ts` y `src/app/api/**`).
  - Usa únicamente variables de entorno de servidor (`process.env.SUPABASE_URL` y `process.env.SUPABASE_SERVICE_ROLE_KEY`). **NUNCA** uses `NEXT_PUBLIC_` para credenciales de base de datos ni importes el cliente de Supabase en componentes frontend (`"use client"`).
  - El frontend (`src/app/page.tsx` y componentes UI) debe comunicarse únicamente mediante `fetch` hacia las rutas internas `/api/...`.
- **Estilo Visual:** Interfaz limpia, intuitiva y responsiva en español. Usa azul marino institucional (`#16324F`) para encabezados/tablas y acentos ámbar/esmeralda para estados y acciones principales.

---

## 2. Esquema Relacional Normalizado (Base de Datos en Supabase)

Usa exactamente estos nombres de tablas y columnas (congruentes con el Modelo E-R de la Etapa 4):

1. **`productos`**
   - `id_producto` (`INT`, Primary Key — ej. `457190`)
   - `nombre_producto` (`VARCHAR`, Not Null)
   - `precio` (`NUMERIC(10,2)`, Not Null)
   - `stock` (`INT`, Not Null, default `0`)
   - `estado_producto` (`VARCHAR`, Not Null, values: `'registrado' | 'disponible' | 'agotado' | 'descontinuado' | 'baja'`)

2. **`ventas`**
   - `folio_venta` (`VARCHAR`, Primary Key — formato `'VTA-001'`, `'VTA-002'`, etc.)
   - `fecha` (`DATE`, Not Null)
   - `hora` (`TIME`, Not Null)
   - `total_venta` (`NUMERIC(10,2)`, Not Null)
   - `metodo_pago` (`VARCHAR`, Not Null, values: `'efectivo' | 'tarjeta' | 'transferencia'`)

3. **`detalle_venta`**
   - `id_detalle_venta` (`SERIAL`, Primary Key)
   - `folio_venta` (`VARCHAR`, Foreign Key -> `ventas.folio_venta`)
   - `id_producto` (`INT`, Foreign Key -> `productos.id_producto`)
   - `cantidad` (`INT`, Not Null)
   - `precio_unitario` (`NUMERIC(10,2)`, Not Null)

4. **`compras`**
   - `folio_compra` (`VARCHAR`, Primary Key — formato `'CMP-001'`, `'CMP-002'`, etc.)
   - `fecha` (`DATE`, Not Null)
   - `total_compra` (`NUMERIC(10,2)`, Not Null)
   - `proveedor` (`VARCHAR`, Nullable)

5. **`detalle_compra`**
   - `id_detalle_compra` (`SERIAL`, Primary Key)
   - `folio_compra` (`VARCHAR`, Foreign Key -> `compras.folio_compra`)
   - `id_producto` (`INT`, Foreign Key -> `productos.id_producto`)
   - `cantidad` (`INT`, Not Null)
   - `costo_unitario` (`NUMERIC(10,2)`, Not Null)

---

## 3. Lógica de Negocio y Rutas del Servidor (`src/app/api/`)

### A. `src/app/api/productos/route.ts` (Proceso 2.1, Proceso 3 y DTE)
- **`GET`:** Retorna todos los productos ordenados por `id_producto`.
- **`POST`:** Da de alta un producto nuevo. Todo producto nuevo **debe nacer en el estado inicial `'registrado'`** con `stock = 0`.
- **`PATCH`:** Ejecuta transiciones válidas de la **Máquina de Estados (DTE)** de la entidad `Producto`. Debe rechazar con HTTP `400` cualquier transición prohibida o intento de modificar un estado final (`'baja'` o `'descontinuado'`):
  - `(registrado, "ingresar_stock")` -> actualiza `estado_producto = 'disponible'` y suma `cantidad` al `stock`.
  - `(registrado, "dar_de_baja")` -> actualiza `estado_producto = 'baja'` (Estado Final).
  - `(disponible, "descontinuar")` -> actualiza `estado_producto = 'descontinuado'` (Estado Final).
  - `(agotado, "reabastecer")` -> actualiza `estado_producto = 'disponible'` y suma `cantidad` al `stock`.
  - `(agotado, "descontinuar")` -> actualiza `estado_producto = 'descontinuado'` (Estado Final).

### B. `src/app/api/ventas/route.ts` (Proceso 2 — Carta de Estructura y Tabla de Decisión)
Estructura el código en tres funciones modulares con cohesión funcional (según `carta_estructura.drawio`) coordinadas por el handler `POST`:
1. **`obtener_datos_venta` (Rama Aferente):** Consulta los productos solicitados en Supabase y valida disponibilidad.
2. **`procesar_transaccion` (Transformación Central):** Evalúa estrictamente las **4 reglas de la Tabla de Decisión (Minispec 2.2)**:
   - **Regla R1:** Si el producto no existe en `productos` -> rechazar (`400`) con mensaje `"Producto no encontrado"`.
   - **Regla R2:** Si `estado_producto !== 'disponible'` -> rechazar (`400`) con mensaje `"Producto agotado / no disponible"`.
   - **Regla R3:** Si `stock < cantidad` -> rechazar (`400`) con mensaje `"Stock insuficiente"`.
   - **Regla R4:** Si cumple todo -> calcular subtotales y `total_venta`.
3. **`registrar_venta_realizada` (Rama Eferente):**
   - Genera `folio_venta` secuencial (`VTA-XXX`), `fecha` y `hora` actuales.
   - Inserta en `ventas` y `detalle_venta`.
   - Descuenta `cantidad` del `stock` en `productos`. Si el nuevo `stock === 0`, aplica automáticamente la transición DTE `vender_todo` cambiando `estado_producto` a `'agotado'`.

### C. `src/app/api/compras/route.ts` (Proceso 4: Registrar Compra)
- **`GET`:** Lista el historial de `compras` ordenado descendentemente.
- **`POST`:** Genera `folio_compra` (`CMP-XXX`), inserta en `compras` y `detalle_compra`, incrementa el `stock` del producto en `productos` y, si su estado era `'registrado'` o `'agotado'`, lo actualiza a `'disponible'`.

### D. `src/app/api/corte/route.ts` (Proceso 5: Realizar Corte de Caja)
- **`GET`:** Filtra registros de `ventas` y `compras` de la fecha actual (`CURRENT_DATE`), calcula `total_ventas_dia`, `total_compras_dia`, `balance_caja = total_ventas_dia - total_compras_dia` y el desglose por `metodo_pago` (`efectivo`, `tarjeta`, `transferencia`).

### E. `src/app/api/kpis/route.ts` (Proceso 1: Generar Reporte Ejecutivo)
- **`GET`:** Recibe query params `fecha_inicio` y `fecha_fin`. Calcula `total_ventas`, `total_compras`, `ganancia_neta = total_ventas - total_compras`, `valor_inventario` (`SUM(stock * precio)`), alertas de stock (`estado_producto === 'agotado'` o `stock <= 5`) y listado de ventas del periodo.

---

## 4. Interfaz Frontend (`src/app/page.tsx`)

Construye una aplicación de una sola página con navegación por pestañas para los **5 procesos del DFD Nivel 1**:
1. **Registrar Venta (POS):** Escáner/buscador rápido por `id_producto` (ej. `457190`) o nombre, catálogo interactivo con badges de estado DTE, carrito de ticket, selector de `metodo_pago`, alertas claras cuando se dispara una regla de rechazo (`R1`, `R2`, `R3`) y un **modal de Comprobante de Venta** tras confirmar el cobro.
2. **Inventario y Estados (DTE):** Formulario de alta de nuevos productos (nacen en `'registrado'`) y tabla con botones dinámicos que muestran **únicamente los eventos válidos** desde el estado actual de cada producto.
3. **Registrar Compra:** Formulario para registrar abastecimiento de proveedores e historial de compras.
4. **Corte de Caja:** Tarjetas resumen con ventas del día, compras del día, balance neto de caja y desglose por método de pago.
5. **Reportes Ejecutivos (KPIs):** Selector de rango de fechas (`fecha_inicio`, `fecha_fin`), tarjetas de KPIs financieros, alertas de stock crítico y tabla de transacciones recientes.

---

## 5. Criterios de Finalización

- Verifica que no haya errores de tipos ejecutando `npm run build`.
- Asegúrate de que todos los montos monetarios se muestren formateados a 2 decimales (`$0.00`) y que los estados de la UI se refresquen automáticamente tras cada operación `POST` o `PATCH`.