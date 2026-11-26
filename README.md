# SIGVI — Sistema de Gestión de Ventas e Inventario para Negocios Minoristas

Prototipo funcional y expediente técnico del proyecto integrador para la asignatura de **Ingeniería de Software** (Grupo 1359) de la **Facultad de Estudios Superiores Cuautitlán — UNAM**.

- **Prototipo desplegado en vivo:** [https://posentregafinal.vercel.app/](https://posentregafinal.vercel.app/)
- **Repositorio CASE:** [https://github.com/321048729-GVZ/ExpedienteFinal-IngSoftware](https://github.com/321048729-GVZ/ExpedienteFinal-IngSoftware)

---

## Datos del Alumno

- **Alumno:** González Vargas Alfredo Zenif
- **Número de Cuenta:** 321048729
- **Carrera:** Ingeniería en Telecomunicaciones, Sistemas y Electrónica
- **Asignatura:** Ingeniería de Software — Grupo 1359
- **Profesor:** Hernández Carmona Leonardo
- **Modalidad:** Individual

---

## Descripción del Proyecto

**SIGVI** es una aplicación web diseñada para digitalizar y agilizar las operaciones diarias de compra, control de existencias y venta en un establecimiento minorista, conectando automáticamente la operación de caja con indicadores clave de rendimiento (KPIs) para eliminar registros manuales y brindar visibilidad real sobre la rentabilidad del negocio.

### Módulos Implementados
1. **Registrar Venta (POS):** Búsqueda rápida por ID o nombre, armado de ticket en tiempo real, validación de stock disponible, descuento automático de inventario y emisión de comprobante de venta.
2. **Productos e Inventario (DTE):** Alta de artículos en estado `registrado` y ejecución controlada de las transiciones del Diagrama de Transición de Estados (`ingresar_stock`, `reabastecer`, `descontinuar`, `dar_de_baja`).
3. **Registrar Compra:** Registro de entradas de mercancía por proveedor con incremento automático de existencias.
4. **Informe Ejecutivo (KPIs):** Consulta por rango de fechas (`fecha_inicio`, `fecha_fin`) de ventas totales, utilidades netas, ticket promedio, volumen de ventas y alertas de stock bajo o agotado.
5. **Corte de Caja:** Arqueo diario de ingresos, egresos por compras, balance neto en caja, desglose por método de pago (`efectivo`, `tarjeta`, `transferencia`) y verificación física de inventario.

### Arquitectura y Tecnologías
- **Frontend:** Next.js (App Router), React, TypeScript y Tailwind CSS.
- **Backend:** API REST monolítica modular sobre Next.js Route Handlers (`/api/productos`, `/api/ventas`, `/api/compras`, `/api/kpis`, `/api/corte`).
- **Base de Datos:** PostgreSQL en Supabase (esquema normalizado en 3FN con las tablas `productos`, `ventas`, `detalle_venta`, `compras` y `detalle_compra`).

### Artefactos CASE Incluidos en el Repositorio
- `diagrama_contexto.drawio` — Diagrama de Contexto (Nivel 0)
- `dfd_preliminar.drawio` — Diagrama de Flujo de Datos Preliminar
- `dfd_nivel1.drawio` — DFD Nivel 1 balanceado
- `dfd_nivel2_proceso_1.drawio` — Explosión DFD Nivel 2 (Proceso Registrar Venta)
- `dte.drawio` — Diagrama de Transición de Estados de la entidad `Producto`
- `carta_estructura.drawio` — Carta de Estructura modular (`atender_venta`)
