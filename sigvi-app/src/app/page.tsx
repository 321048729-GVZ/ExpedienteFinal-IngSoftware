"use client";

import { useState, useEffect, useCallback } from "react";

type Tab = 1 | 2 | 3 | 4 | 5;

function formatCurrency(val: number | string | null | undefined): string {
  const num = Number(val);
  if (val === null || val === undefined || Number.isNaN(num)) return "0.00";
  return num.toFixed(2);
}

interface Producto {
  id_producto: number;
  nombre_producto: string;
  precio: number;
  stock: number;
  estado_producto: string;
}

interface ItemVenta {
  id_producto: number;
  nombre_producto: string;
  cantidad: number;
  precio_unitario: number;
  stock_disponible: number;
}

interface Comprobante {
  folio_venta: string;
  fecha: string;
  hora: string;
  total_venta: number;
  metodo_pago: string;
  items: {
    id_producto: number;
    nombre_producto: string;
    cantidad: number;
    precio_unitario: number;
  }[];
}

function getEstadoBadgeClass(estado: string): string {
  switch (estado) {
    case "disponible":
      return "bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full px-2.5 py-0.5";
    case "agotado":
      return "bg-red-100 text-red-800 text-xs font-semibold rounded-full px-2.5 py-0.5";
    case "registrado":
      return "bg-blue-100 text-blue-800 text-xs font-semibold rounded-full px-2.5 py-0.5";
    case "descontinuado":
      return "bg-amber-100 text-amber-800 text-xs font-semibold rounded-full px-2.5 py-0.5";
    case "baja":
      return "bg-slate-200 text-slate-700 text-xs font-semibold rounded-full px-2.5 py-0.5";
    default:
      return "bg-slate-100 text-slate-700 text-xs font-semibold rounded-full px-2.5 py-0.5";
  }
}

function navBtnClass(active: Tab, tab: Tab): string {
  return active === tab
    ? "bg-white/20 text-white rounded-lg px-3.5 py-2 text-sm font-medium transition"
    : "text-slate-300 hover:text-white hover:bg-white/10 rounded-lg px-3.5 py-2 text-sm font-medium transition";
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<Tab>(1);
  const [hoyIso, setHoyIso] = useState("");
  const [banner, setBanner] = useState<{ tipo: "ok" | "err"; msg: string } | null>(null);

  const mostrarAviso = (tipo: "ok" | "err", msg: string) => {
    setBanner({ tipo, msg });
    setTimeout(() => setBanner(null), 4500);
  };

  // ===== CATÁLOGO GLOBAL =====
  const [productosTodos, setProductosTodos] = useState<Producto[]>([]);

  const cargarProductos = useCallback(async () => {
    try {
      const res = await fetch("/api/productos");
      const json = await res.json();
      const lista = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
      if (!res.ok) {
        mostrarAviso("err", json?.error || "No se pudieron cargar los productos");
        return;
      }
      setProductosTodos(lista);
    } catch {
      mostrarAviso("err", "Error de conexión al consultar /api/productos");
    }
  }, []);

  // ===== VISTA 4: Estado inicial de fechas (sin new Date() en render) =====
  const [fechas, setFechas] = useState({
    fecha_inicio: "",
    fecha_fin: "",
  });

  useEffect(() => {
    const h = new Date().toISOString().slice(0, 10);
    setHoyIso(h);
    setFechas({ fecha_inicio: h, fecha_fin: h });
    cargarProductos();
  }, [cargarProductos]);

  // ===== VISTA 1: Registrar Venta (POS) =====
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<ItemVenta[]>([]);
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo");
  const [procesandoVenta, setProcesandoVenta] = useState(false);
  const [comprobante, setComprobante] = useState<Comprobante | null>(null);

  const productosDisponibles = productosTodos.filter(
    (p) =>
      p.estado_producto === "disponible" &&
      Number(p.stock) > 0 &&
      (busqueda.trim() === "" ||
        p.nombre_producto.toLowerCase().includes(busqueda.trim().toLowerCase()) ||
        String(p.id_producto).includes(busqueda.trim()))
  );

  const agregarAlCarrito = (producto: Producto) => {
    setCarrito((prev) => {
      const existe = prev.find((item) => item.id_producto === producto.id_producto);
      if (existe) {
        if (existe.cantidad >= Number(producto.stock)) {
          mostrarAviso("err", `Stock máximo alcanzado para ${producto.nombre_producto}`);
          return prev;
        }
        return prev.map((item) =>
          item.id_producto === producto.id_producto
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          id_producto: producto.id_producto,
          nombre_producto: producto.nombre_producto,
          cantidad: 1,
          precio_unitario: Number(producto.precio),
          stock_disponible: Number(producto.stock),
        },
      ];
    });
  };

  const decrementarDelCarrito = (id: number) => {
    setCarrito((prev) =>
      prev
        .map((item) =>
          item.id_producto === id ? { ...item, cantidad: item.cantidad - 1 } : item
        )
        .filter((item) => item.cantidad > 0)
    );
  };

  const quitarDelCarrito = (id: number) => {
    setCarrito((prev) => prev.filter((item) => item.id_producto !== id));
  };

  const calcularTotal = (): number =>
    carrito.reduce((total, item) => total + item.precio_unitario * item.cantidad, 0);

  const handleCobrar = async () => {
    if (carrito.length === 0 || procesandoVenta) return;
    setProcesandoVenta(true);
    try {
      const itemsSnapshot = carrito.map((c) => ({ ...c }));
      const totalSnapshot = calcularTotal();

      const res = await fetch("/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodo_pago: metodoPago,
          items: itemsSnapshot.map((c) => ({
            id_producto: c.id_producto,
            cantidad: c.cantidad,
          })),
          productos: itemsSnapshot.map((c) => c.id_producto),
          cantidades: itemsSnapshot.map((c) => c.cantidad),
        }),
      });
      const json = await res.json();

      if (!res.ok || json?.error) {
        mostrarAviso("err", json?.error || "Error al procesar la venta");
        return;
      }

      const payload = json?.data ?? json;
      setComprobante({
        folio_venta: payload?.folio_venta || `V-${Date.now().toString().slice(-6)}`,
        fecha: payload?.fecha || new Date().toISOString().slice(0, 10),
        hora: payload?.hora || new Date().toTimeString().slice(0, 8),
        total_venta: Number(payload?.total_venta ?? totalSnapshot),
        metodo_pago: payload?.metodo_pago || metodoPago,
        items: itemsSnapshot,
      });

      setCarrito([]);
      setBusqueda("");
      await cargarProductos();
    } catch {
      mostrarAviso("err", "Error de red al registrar la venta");
    } finally {
      setProcesandoVenta(false);
    }
  };

  // ===== VISTA 2: Productos e Inventario (DTE) =====
  const [estadoForm, setEstadoForm] = useState({
    nuevoId: "",
    nuevoNombre: "",
    nuevoPrecio: "",
  });
  const [guardandoProducto, setGuardandoProducto] = useState(false);

  const handleCrearProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = Number(estadoForm.nuevoId.trim());
    const nombre = estadoForm.nuevoNombre.trim();
    const precio = Number(estadoForm.nuevoPrecio);

    if (!Number.isInteger(id) || id <= 0 || !nombre || !Number.isFinite(precio) || precio < 0) {
      mostrarAviso("err", "Verifica el ID numérico, nombre y precio (>= 0)");
      return;
    }

    setGuardandoProducto(true);
    try {
      const res = await fetch("/api/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_producto: id,
          nombre_producto: nombre,
          precio,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) {
        mostrarAviso("err", json?.error || "No se pudo registrar el producto");
        return;
      }
      mostrarAviso("ok", `Producto #${id} creado en estado 'registrado' (stock: 0)`);
      setEstadoForm({ nuevoId: "", nuevoNombre: "", nuevoPrecio: "" });
      await cargarProductos();
    } catch {
      mostrarAviso("err", "Error de conexión al crear producto");
    } finally {
      setGuardandoProducto(false);
    }
  };

  const handleEstadoTransicion = async (id: number, evento: string) => {
    try {
      const res = await fetch("/api/productos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_producto: id,
          accion: evento,
          evento,
          cantidad: 10,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) {
        mostrarAviso("err", json?.error || "Transición no permitida por el DTE");
        return;
      }
      mostrarAviso("ok", `Transición '${evento}' aplicada correctamente`);
      await cargarProductos();
    } catch {
      mostrarAviso("err", "Error al actualizar el estado del producto");
    }
  };

  // ===== VISTA 3: Registrar Compra =====
  const [comprasHistorial, setComprasHistorial] = useState<Record<string, unknown>[]>([]);
  const [compraForm, setCompraForm] = useState({
    proveedor: "",
    nuevoIdProducto: "",
    nuevaCantidad: "10",
    nuevoCostoUnitario: "",
  });
  const [guardandoCompra, setGuardandoCompra] = useState(false);

  const cargarCompras = useCallback(async () => {
    try {
      const res = await fetch("/api/compras");
      const json = await res.json();
      const lista = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
      if (res.ok) setComprasHistorial(lista);
    } catch {
      // Silencioso en carga inicial
    }
  }, []);

  useEffect(() => {
    if (activeTab === 3) cargarCompras();
  }, [activeTab, cargarCompras]);

  const handleRegistrarCompra = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = Number(compraForm.nuevoIdProducto);
    const cantidad = Number(compraForm.nuevaCantidad);
    const costo = Number(compraForm.nuevoCostoUnitario);

    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(cantidad) || cantidad <= 0 || !Number.isFinite(costo) || costo < 0) {
      mostrarAviso("err", "Selecciona un producto, cantidad > 0 y costo unitario >= 0");
      return;
    }

    setGuardandoCompra(true);
    try {
      const res = await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_producto: id,
          cantidad,
          costo_unitario: costo,
          proveedor: compraForm.proveedor.trim() || "Proveedor General",
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) {
        mostrarAviso("err", json?.error || "Error al registrar la compra");
        return;
      }
      mostrarAviso("ok", "Compra registrada e inventario actualizado");
      setCompraForm({
        proveedor: "",
        nuevoIdProducto: "",
        nuevaCantidad: "10",
        nuevoCostoUnitario: "",
      });
      await Promise.all([cargarCompras(), cargarProductos()]);
    } catch {
      mostrarAviso("err", "Error de conexión al guardar la compra");
    } finally {
      setGuardandoCompra(false);
    }
  };

  // ===== VISTA 4: Informe Ejecutivo (KPIs) =====
  const [kpis, setKpis] = useState({
    ventas_totales: 0,
    numero_ventas: 0,
    ticket_promedio: 0,
    costo_productos_vendidos: 0,
    utilidades: 0,
    alertas_stock: [] as Producto[],
    ventas_periodo: [] as Record<string, unknown>[],
  });

  const handleConsultarKPIs = useCallback(async () => {
    if (!fechas.fecha_inicio || !fechas.fecha_fin) return;
    try {
      const url = `/api/kpis?fecha_inicio=${fechas.fecha_inicio}&fecha_fin=${fechas.fecha_fin}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || json?.error) {
        mostrarAviso("err", json?.error || "Error al consultar KPIs");
        return;
      }
      const d = json?.data ?? json;
      const ventasTot = Number(d?.ventas_totales ?? d?.total_ventas ?? 0);
      const numVentas = Number(d?.numero_ventas ?? 0);
      setKpis({
        ventas_totales: ventasTot,
        numero_ventas: numVentas,
        ticket_promedio: Number(d?.ticket_promedio ?? (numVentas > 0 ? ventasTot / numVentas : 0)),
        costo_productos_vendidos: Number(d?.costo_productos_vendidos ?? 0),
        utilidades: Number(d?.utilidades ?? d?.ganancia_neta ?? 0),
        alertas_stock: Array.isArray(d?.alertas_stock) ? d.alertas_stock : [],
        ventas_periodo: Array.isArray(d?.ventas_periodo) ? d.ventas_periodo : [],
      });
    } catch {
      mostrarAviso("err", "Error de conexión al consultar /api/kpis");
    }
  }, [fechas.fecha_inicio, fechas.fecha_fin]);

  useEffect(() => {
    if (activeTab === 4) handleConsultarKPIs();
  }, [activeTab, handleConsultarKPIs]);

  // ===== VISTA 5: Corte de Caja =====
  const [turnoCerrado, setTurnoCerrado] = useState(false);
  const [corteData, setCorteData] = useState({
    total_ventas_dia: 0,
    total_compras_dia: 0,
    balance_caja: 0,
    desglosePago: { efectivo: 0, tarjeta: 0, transferencia: 0 },
  });

  const cargarCorte = useCallback(async () => {
    try {
      const res = await fetch("/api/corte");
      const json = await res.json();
      if (!res.ok || json?.error) return;
      const d = json?.data ?? json;
      const desglose = d?.desglosePago ?? d?.por_metodo ?? {};
      setCorteData({
        total_ventas_dia: Number(d?.total_ventas_dia ?? 0),
        total_compras_dia: Number(d?.total_compras_dia ?? 0),
        balance_caja: Number(d?.balance_caja ?? 0),
        desglosePago: {
          efectivo: Number(desglose?.efectivo ?? 0),
          tarjeta: Number(desglose?.tarjeta ?? 0),
          transferencia: Number(desglose?.transferencia ?? 0),
        },
      });
    } catch {
      // Silencioso
    }
  }, []);

  useEffect(() => {
    if (activeTab === 5) cargarCorte();
  }, [activeTab, cargarCorte]);

  // ===== RENDER =====
  return (
    <div className="min-h-screen flex flex-col">
      {/* Barra superior institucional (#16324F) */}
      <header className="bg-[#16324F] text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight">SIGVI</span>
            <span className="text-xs bg-white/10 text-slate-200 px-2.5 py-0.5 rounded-full">
              POS &amp; Inventario
            </span>
          </div>

          <nav className="flex flex-wrap gap-1.5">
            <button onClick={() => setActiveTab(1)} className={navBtnClass(activeTab, 1)}>
              Registrar Venta
            </button>
            <button onClick={() => setActiveTab(2)} className={navBtnClass(activeTab, 2)}>
              Productos e Inventario
            </button>
            <button onClick={() => setActiveTab(3)} className={navBtnClass(activeTab, 3)}>
              Registrar Compra
            </button>
            <button onClick={() => setActiveTab(4)} className={navBtnClass(activeTab, 4)}>
              Informe Ejecutivo
            </button>
            <button onClick={() => setActiveTab(5)} className={navBtnClass(activeTab, 5)}>
              Corte de Caja
            </button>
          </nav>

          <div className="text-right text-xs hidden sm:block">
            <p className="font-semibold">Sucursal Centro</p>
            <p className="text-slate-300">Administrador</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-6 py-8 flex-1 space-y-6">
        {banner && (
          <div
            className={`px-4 py-3 rounded-xl border text-sm font-medium ${
              banner.tipo === "ok"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {banner.msg}
          </div>
        )}

        {/* ================= VISTA 1: REGISTRAR VENTA ================= */}
        {activeTab === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Izquierda: Buscador y catálogo */}
            <section className="lg:col-span-7 space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Registrar Venta</h1>
                <p className="text-sm text-slate-500">
                  Selecciona productos disponibles para agregarlos al ticket y completar la venta.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = busqueda.trim().toLowerCase();
                  if (!q) return;
                  const exacto = productosDisponibles.find(
                    (p) => String(p.id_producto) === q || p.nombre_producto.toLowerCase() === q
                  );
                  if (exacto) {
                    agregarAlCarrito(exacto);
                    setBusqueda("");
                  } else if (productosDisponibles.length === 1) {
                    agregarAlCarrito(productosDisponibles[0]);
                    setBusqueda("");
                  }
                }}
                className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-2 shadow-xs"
              >
                <input
                  type="text"
                  placeholder="Buscar ID o nombre del producto..."
                  className="flex-1 border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-[#2563EB]"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
                <button
                  type="submit"
                  className="bg-[#2563EB] text-white px-4 py-2 rounded-xl hover:bg-blue-700 text-sm font-medium"
                >
                  Agregar
                </button>
              </form>

              {productosDisponibles.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {productosDisponibles.map((producto) => (
                    <button
                      type="button"
                      key={producto.id_producto}
                      onClick={() => agregarAlCarrito(producto)}
                      className="text-left bg-white border border-slate-200 rounded-2xl p-4 hover:border-[#2563EB] hover:shadow-sm transition flex flex-col justify-between gap-3"
                    >
                      <div>
                        <span className="text-xs font-mono text-slate-400">
                          #{producto.id_producto}
                        </span>
                        <h3 className="font-semibold text-slate-900 mt-0.5">
                          {producto.nombre_producto}
                        </h3>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-lg font-bold text-slate-900">
                          ${formatCurrency(producto.precio)}
                        </span>
                        <span className="bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full px-2.5 py-0.5">
                          {producto.stock} en stock
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
                  No hay productos disponibles con stock para venta.
                </div>
              )}
            </section>

            {/* Derecha: Panel Ticket */}
            <aside className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-5 h-fit">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-lg font-bold">Ticket</h2>
                {carrito.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCarrito([])}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Vaciar ticket
                  </button>
                )}
              </div>

              {carrito.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">
                  Selecciona un producto del catálogo para agregarlo al ticket.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase">
                        <th className="py-2 text-left">Producto</th>
                        <th className="py-2 text-center">Cant.</th>
                        <th className="py-2 text-right">Subtotal</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {carrito.map((item) => (
                        <tr key={item.id_producto}>
                          <td className="py-2.5 pr-2">
                            <div className="font-medium text-slate-900">{item.nombre_producto}</div>
                            <div className="text-xs text-slate-400">
                              ${formatCurrency(item.precio_unitario)} c/u
                            </div>
                          </td>
                          <td className="py-2.5 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => decrementarDelCarrito(item.id_producto)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-800 w-6 h-6 rounded font-bold"
                            >
                              -
                            </button>
                            <span className="mx-2 font-semibold">{item.cantidad}</span>
                            <button
                              type="button"
                              onClick={() =>
                                agregarAlCarrito({
                                  id_producto: item.id_producto,
                                  nombre_producto: item.nombre_producto,
                                  precio: item.precio_unitario,
                                  stock: item.stock_disponible,
                                  estado_producto: "disponible",
                                })
                              }
                              className="bg-slate-100 hover:bg-slate-200 text-slate-800 w-6 h-6 rounded font-bold"
                            >
                              +
                            </button>
                          </td>
                          <td className="py-2.5 text-right font-semibold">
                            ${formatCurrency(item.precio_unitario * item.cantidad)}
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            <button
                              type="button"
                              onClick={() => quitarDelCarrito(item.id_producto)}
                              className="text-xs text-red-600 hover:text-red-800 font-semibold"
                            >
                              X
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Método de pago
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["efectivo", "tarjeta", "transferencia"] as const).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setMetodoPago(m)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition ${
                        metodoPago === m
                          ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-600">Total</span>
                <span className="text-2xl font-extrabold text-slate-900">
                  ${formatCurrency(calcularTotal())}
                </span>
              </div>

              <button
                type="button"
                disabled={carrito.length === 0 || procesandoVenta}
                onClick={handleCobrar}
                className="w-full bg-[#2563EB] disabled:bg-slate-300 text-white px-4 py-3 rounded-xl hover:bg-blue-700 font-semibold text-sm transition"
              >
                {procesandoVenta ? "Procesando cobro..." : "Cobrar"}
              </button>
            </aside>
          </div>
        )}

        {/* ================= VISTA 2: PRODUCTOS E INVENTARIO (DTE) ================= */}
        {activeTab === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Productos e Inventario</h1>
              <p className="text-sm text-slate-500">
                Administra el catálogo y ejecuta las transiciones válidas del ciclo de vida (DTE).
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-bold">Nuevo producto</h2>
                <span className="text-xs text-slate-400">
                  Los productos nuevos se crean en estado &quot;registrado&quot; sin stock.
                </span>
              </div>

              <form onSubmit={handleCrearProducto} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">ID Producto</label>
                  <input
                    type="number"
                    required
                    value={estadoForm.nuevoId}
                    onChange={(e) => setEstadoForm({ ...estadoForm, nuevoId: e.target.value })}
                    className="border border-slate-300 rounded-xl px-3 py-2 w-full text-sm"
                    placeholder="Ej. 457190"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre</label>
                  <input
                    type="text"
                    required
                    value={estadoForm.nuevoNombre}
                    onChange={(e) => setEstadoForm({ ...estadoForm, nuevoNombre: e.target.value })}
                    className="border border-slate-300 rounded-xl px-3 py-2 w-full text-sm"
                    placeholder="Nombre del producto"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Precio ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={estadoForm.nuevoPrecio}
                    onChange={(e) => setEstadoForm({ ...estadoForm, nuevoPrecio: e.target.value })}
                    className="border border-slate-300 rounded-xl px-3 py-2 w-full text-sm"
                    placeholder="0.00"
                  />
                </div>
                <button
                  type="submit"
                  disabled={guardandoProducto}
                  className="bg-[#2563EB] text-white px-4 py-2 rounded-xl hover:bg-blue-700 font-semibold text-sm"
                >
                  {guardandoProducto ? "Guardando..." : "Crear"}
                </button>
              </form>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-bold">Inventario ({productosTodos.length} productos)</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase">
                    <tr>
                      <th className="p-4">ID</th>
                      <th className="p-4">Producto</th>
                      <th className="p-4">Precio</th>
                      <th className="p-4">Stock</th>
                      <th className="p-4">Estado</th>
                      <th className="p-4">Acciones DTE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productosTodos.length > 0 ? (
                      productosTodos.map((producto) => (
                        <tr key={producto.id_producto} className="hover:bg-slate-50/60">
                          <td className="p-4 font-mono text-slate-600">#{producto.id_producto}</td>
                          <td className="p-4 font-semibold text-slate-900">{producto.nombre_producto}</td>
                          <td className="p-4">${formatCurrency(producto.precio)}</td>
                          <td className="p-4 font-bold">{producto.stock}</td>
                          <td className="p-4">
                            <span className={getEstadoBadgeClass(producto.estado_producto)}>
                              {producto.estado_producto}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1.5">
                              {producto.estado_producto === "registrado" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleEstadoTransicion(producto.id_producto, "ingresar_stock")}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg px-2.5 py-1"
                                  >
                                    Ingresar Stock (+10)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEstadoTransicion(producto.id_producto, "dar_de_baja")}
                                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg px-2.5 py-1"
                                  >
                                    Dar de Baja
                                  </button>
                                </>
                              )}
                              {producto.estado_producto === "agotado" && (
                                <button
                                  type="button"
                                  onClick={() => handleEstadoTransicion(producto.id_producto, "reabastecer")}
                                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg px-2.5 py-1"
                                >
                                  Reabastecer (+10)
                                </button>
                              )}
                              {(producto.estado_producto === "disponible" ||
                                producto.estado_producto === "agotado") && (
                                <button
                                  type="button"
                                  onClick={() => handleEstadoTransicion(producto.id_producto, "descontinuar")}
                                  className="bg-slate-600 hover:bg-slate-700 text-white text-xs font-medium rounded-lg px-2.5 py-1"
                                >
                                  Descontinuar
                                </button>
                              )}
                              {(producto.estado_producto === "baja" ||
                                producto.estado_producto === "descontinuado") && (
                                <span className="text-xs text-slate-400 italic">Estado final</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">
                          No hay productos registrados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= VISTA 3: REGISTRAR COMPRA ================= */}
        {activeTab === 3 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Registrar Compra</h1>
              <p className="text-sm text-slate-500">
                Registra entradas de mercancía de proveedores y actualiza existencias automáticamente.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6">
              <h2 className="text-base font-bold mb-4">Nueva compra</h2>
              <form onSubmit={handleRegistrarCompra} className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Producto</label>
                  <select
                    required
                    value={compraForm.nuevoIdProducto}
                    onChange={(e) => setCompraForm({ ...compraForm, nuevoIdProducto: e.target.value })}
                    className="border border-slate-300 rounded-xl px-3 py-2 w-full text-sm bg-white"
                  >
                    <option value="">Selecciona producto...</option>
                    {productosTodos.map((p) => (
                      <option key={p.id_producto} value={p.id_producto}>
                        #{p.id_producto} - {p.nombre_producto}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={compraForm.nuevaCantidad}
                    onChange={(e) => setCompraForm({ ...compraForm, nuevaCantidad: e.target.value })}
                    className="border border-slate-300 rounded-xl px-3 py-2 w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Costo Unitario ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={compraForm.nuevoCostoUnitario}
                    onChange={(e) => setCompraForm({ ...compraForm, nuevoCostoUnitario: e.target.value })}
                    className="border border-slate-300 rounded-xl px-3 py-2 w-full text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Proveedor</label>
                  <input
                    type="text"
                    value={compraForm.proveedor}
                    onChange={(e) => setCompraForm({ ...compraForm, proveedor: e.target.value })}
                    className="border border-slate-300 rounded-xl px-3 py-2 w-full text-sm"
                    placeholder="Nombre del proveedor"
                  />
                </div>
                <button
                  type="submit"
                  disabled={guardandoCompra}
                  className="bg-[#2563EB] text-white px-4 py-2 rounded-xl hover:bg-blue-700 font-semibold text-sm"
                >
                  {guardandoCompra ? "Registrando..." : "Registrar Compra"}
                </button>
              </form>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-bold">Historial de Compras</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase">
                    <tr>
                      <th className="p-4">Folio</th>
                      <th className="p-4">Fecha</th>
                      <th className="p-4">Proveedor</th>
                      <th className="p-4 text-right">Total Compra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {comprasHistorial.length > 0 ? (
                      comprasHistorial.map((compra, idx) => (
                        <tr key={String(compra.folio_compra || idx)}>
                          <td className="p-4 font-mono">{String(compra.folio_compra || "-")}</td>
                          <td className="p-4">{String(compra.fecha || "-")}</td>
                          <td className="p-4">{String(compra.proveedor || "N/A")}</td>
                          <td className="p-4 text-right font-bold">
                            ${formatCurrency(compra.total_compra as number)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-500">
                          No hay registros de compras
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= VISTA 4: INFORME EJECUTIVO (KPIs) ================= */}
        {activeTab === 4 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Informe Ejecutivo</h1>
              <p className="text-sm text-slate-500">
                Indicadores clave de rendimiento y alertas de reposición por periodo.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-5 flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha Inicio</label>
                <input
                  type="date"
                  value={fechas.fecha_inicio}
                  onChange={(e) => setFechas({ ...fechas, fecha_inicio: e.target.value })}
                  className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha Fin</label>
                <input
                  type="date"
                  value={fechas.fecha_fin}
                  onChange={(e) => setFechas({ ...fechas, fecha_fin: e.target.value })}
                  className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleConsultarKPIs}
                className="bg-[#2563EB] text-white px-5 py-2 rounded-xl hover:bg-blue-700 font-semibold text-sm"
              >
                Consultar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6">
                <div className="text-xs font-semibold uppercase text-slate-400">Ventas Totales</div>
                <div className="text-3xl font-extrabold text-slate-900 mt-1">
                  ${formatCurrency(kpis.ventas_totales)}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6">
                <div className="text-xs font-semibold uppercase text-slate-400">Utilidades</div>
                <div className="text-3xl font-extrabold text-emerald-600 mt-1">
                  ${formatCurrency(kpis.utilidades)}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6">
                <div className="text-xs font-semibold uppercase text-slate-400">Ticket Promedio</div>
                <div className="text-3xl font-extrabold text-blue-600 mt-1">
                  ${formatCurrency(kpis.ticket_promedio)}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6">
                <div className="text-xs font-semibold uppercase text-slate-400">Número de Ventas</div>
                <div className="text-3xl font-extrabold text-slate-900 mt-1">{kpis.numero_ventas}</div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-bold">Alertas de Stock Bajo / Agotado</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase">
                    <tr>
                      <th className="p-4">ID</th>
                      <th className="p-4">Producto</th>
                      <th className="p-4">Estado</th>
                      <th className="p-4">Stock</th>
                      <th className="p-4">Precio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {kpis.alertas_stock.length > 0 ? (
                      kpis.alertas_stock.map((item) => (
                        <tr key={item.id_producto}>
                          <td className="p-4 font-mono">#{item.id_producto}</td>
                          <td className="p-4 font-semibold">{item.nombre_producto}</td>
                          <td className="p-4">
                            <span className={getEstadoBadgeClass(item.estado_producto)}>
                              {item.estado_producto}
                            </span>
                          </td>
                          <td className="p-4 font-bold">{item.stock}</td>
                          <td className="p-4">${formatCurrency(item.precio)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500">
                          No hay alertas de stock en este momento
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= VISTA 5: CORTE DE CAJA ================= */}
        {activeTab === 5 && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Corte de Caja</h1>
                <p className="text-sm text-slate-500">
                  Arqueo diario{hoyIso ? ` del ${hoyIso}` : ""} y verificación física contra existencias registradas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTurnoCerrado(true);
                  mostrarAviso("ok", "Corte de caja registrado y turno cerrado correctamente.");
                }}
                className="bg-[#2563EB] hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm"
              >
                {turnoCerrado ? "Turno Cerrado ✓" : "Cerrar Turno"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6">
                <div className="text-xs font-semibold uppercase text-slate-400">Ventas del Día</div>
                <div className="text-3xl font-extrabold text-slate-900 mt-1">
                  ${formatCurrency(corteData.total_ventas_dia)}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6">
                <div className="text-xs font-semibold uppercase text-slate-400">Compras del Día</div>
                <div className="text-3xl font-extrabold text-slate-900 mt-1">
                  ${formatCurrency(corteData.total_compras_dia)}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6">
                <div className="text-xs font-semibold uppercase text-slate-400">Balance Neto</div>
                <div className="text-3xl font-extrabold text-emerald-600 mt-1">
                  ${formatCurrency(corteData.balance_caja)}
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4">
              <h2 className="text-base font-bold">Desglose por Método de Pago</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="text-xs font-semibold text-slate-500">Efectivo</div>
                  <div className="text-2xl font-bold mt-1">
                    ${formatCurrency(corteData.desglosePago.efectivo)}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="text-xs font-semibold text-slate-500">Tarjeta</div>
                  <div className="text-2xl font-bold mt-1">
                    ${formatCurrency(corteData.desglosePago.tarjeta)}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="text-xs font-semibold text-slate-500">Transferencia</div>
                  <div className="text-2xl font-bold mt-1">
                    ${formatCurrency(corteData.desglosePago.transferencia)}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-bold">Verificación de Inventario</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase">
                    <tr>
                      <th className="p-4">ID</th>
                      <th className="p-4">Nombre</th>
                      <th className="p-4">Stock Registrado</th>
                      <th className="p-4">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productosTodos.map((producto) => (
                      <tr key={producto.id_producto}>
                        <td className="p-4 font-mono">#{producto.id_producto}</td>
                        <td className="p-4 font-semibold">{producto.nombre_producto}</td>
                        <td className="p-4 font-bold">{producto.stock}</td>
                        <td className="p-4">
                          <span className={getEstadoBadgeClass(producto.estado_producto)}>
                            {producto.estado_producto}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal Comprobante de Venta (Función #5 de E2.5) */}
      {comprobante && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-xs font-semibold uppercase text-emerald-600">Venta Confirmada</span>
              <h3 className="text-xl font-bold text-slate-900">
                Comprobante {comprobante.folio_venta}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {comprobante.fecha} · {comprobante.hora} · Método: {comprobante.metodo_pago}
              </p>
            </div>
            <div className="divide-y divide-slate-100 text-sm">
              {comprobante.items.map((it) => (
                <div key={it.id_producto} className="py-2 flex justify-between">
                  <span>
                    {it.cantidad}x {it.nombre_producto}
                  </span>
                  <span className="font-semibold">
                    ${formatCurrency(it.cantidad * it.precio_unitario)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 pt-3 flex justify-between items-center text-base font-bold">
              <span>Total Pagado</span>
              <span className="text-xl text-[#16324F]">
                ${formatCurrency(comprobante.total_venta)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setComprobante(null)}
              className="w-full bg-[#2563EB] hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold text-sm"
            >
              Cerrar Comprobante
            </button>
          </div>
        </div>
      )}
    </div>
  );
}