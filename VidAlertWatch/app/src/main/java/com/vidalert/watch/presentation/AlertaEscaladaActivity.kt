package com.vidalert.watch.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.*
import com.vidalert.watch.R
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class AlertaEscaladaActivity : ComponentActivity() {

    private lateinit var manager: AlertaEscaladaManager
    private var datosSensor = DatosSensor()
    private val backendUrl = "http://192.168.1.141:8000"  // ← tu IP

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        datosSensor = DatosSensor(
            uid          = intent.getStringExtra("uid") ?: "uid_prueba",
            bpm          = intent.getIntExtra("bpm", 120),
            spo2         = intent.getIntExtra("spo2", 92),
            pasos        = intent.getIntExtra("pasos", 3),
            movimiento   = intent.getStringExtra("movimiento") ?: "inactivo",
            tiempoSinMov = intent.getIntExtra("tiempo_sin_movimiento", 15),
            caida        = intent.getBooleanExtra("caida_detectada", false),
            lat          = intent.getDoubleExtra("lat", 38.3932702),  // ← ¿está esto?
            lon          = intent.getDoubleExtra("lon", -0.5217082)   // ← ¿está esto
        )

        manager = AlertaEscaladaManager(this)

        // PASO 1: Preguntar al backend si hay que avisar al usuario
        evaluarEnBackend(datosSensor) { debeActivar ->
            if (debeActivar) {
                // PASO 2: Backend dice ACTIVAR → mostrar pantalla de avisos
                setContent {
                    var estado by remember { mutableStateOf(EstadoAlerta()) }

                    LaunchedEffect(Unit) {
                        manager.iniciar(
                            soundResId     = R.raw.alerta_emergencia,
                            onEstadoCambia = { nuevoEstado -> estado = nuevoEstado },
                            onDisparar     = {
                                // PASO 3: Usuario no canceló → activar emergencia real
                                activarEnBackend(datosSensor)
                            }
                        )
                    }

                    PantallaAlerta(
                        estado     = estado,
                        onCancelar = { manager.cancelar() }
                    )
                }
            } else {
                // Backend dice OK → no hacer nada, cerrar la activity
                println("✅ Backend evaluó: valores normales, sin alerta")
                finish()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        manager.cancelar()
    }

    // ── PASO 1: Evaluar ───────────────────────────────────────────────────────
    private fun evaluarEnBackend(datos: DatosSensor, callback: (Boolean) -> Unit) {
        val body = buildJsonBody(datos)

        val request = Request.Builder()
            .url("$backendUrl/emergencias/evaluar-wearable")
            .post(body)
            .build()

        OkHttpClient().newCall(request).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: Call, e: java.io.IOException) {
                println("⚠️ Error al evaluar: ${e.message}")
                // Si el backend no responde → activar por precaución
                runOnUiThread { callback(true) }
            }
            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string() ?: ""
                println("📡 Evaluación backend: $bodyStr")
                val accion = try {
                    JSONObject(bodyStr).getString("accion")
                } catch (e: Exception) { "OK" }
                runOnUiThread { callback(accion == "ACTIVAR") }
            }
        })
    }

    // ── PASO 3: Activar emergencia real ───────────────────────────────────────
    private fun activarEnBackend(datos: DatosSensor) {
        val body = buildJsonBody(datos)

        val request = Request.Builder()
            .url("$backendUrl/emergencias/activar-wearable")
            .post(body)
            .build()

        OkHttpClient().newCall(request).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: Call, e: java.io.IOException) {
                println("⚠️ Error al activar emergencia: ${e.message}")
            }
            override fun onResponse(call: Call, response: Response) {
                println("🚨 Emergencia activada: ${response.body?.string()}")
            }
        })
    }

    // ── Helper: construir el JSON con los datos del sensor ────────────────────
    private fun buildJsonBody(datos: DatosSensor): RequestBody {
        val json = JSONObject().apply {
            put("uid_ciudadano",         datos.uid)
            put("bpm",                   datos.bpm)
            put("spo2",                  datos.spo2)
            put("pasos",                 datos.pasos)
            put("movimiento",            datos.movimiento)
            put("tiempo_sin_movimiento", datos.tiempoSinMov)
            put("caida_detectada",       datos.caida)
            put("lat",                   38.3932702)   // ubicacion del reloj
            put("lon",                   -0.5217082)   // ubicacion del reloj
        }
        return json.toString().toRequestBody("application/json".toMediaType())
    }
}


// ── UI ────────────────────────────────────────────────────────────────────────

@Composable
fun PantallaAlerta(estado: EstadoAlerta, onCancelar: () -> Unit) {

    val colorFondo by animateColorAsState(
        targetValue = when (estado.fase) {
            FaseAlerta.FASE_1_AMARILLO -> Color(0xFFFFB300)
            FaseAlerta.FASE_2_NARANJA  -> Color(0xFFE65100)
            FaseAlerta.FASE_3_ROJO     -> Color(0xFFB71C1C)
            FaseAlerta.DISPARADA       -> Color(0xFF7B0000)
            FaseAlerta.CANCELADA       -> Color(0xFF1B5E20)
            else                       -> Color(0xFF212121)
        },
        animationSpec = tween(durationMillis = 600),
        label = "colorFondo"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colorFondo),
        contentAlignment = Alignment.Center
    ) {
        when (estado.fase) {
            FaseAlerta.CANCELADA -> PantallaCancelada()
            FaseAlerta.DISPARADA -> PantallaDisparada()
            else -> PantallaContador(estado = estado, onCancelar = onCancelar)
        }
    }
}

@Composable
fun PantallaContador(estado: EstadoAlerta, onCancelar: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier.fillMaxSize().padding(12.dp)
    ) {
        val icono = when (estado.fase) {
            FaseAlerta.FASE_1_AMARILLO -> "⚠️"
            FaseAlerta.FASE_2_NARANJA  -> "🔶"
            FaseAlerta.FASE_3_ROJO     -> "🚨"
            else -> "⚠️"
        }
        val mensaje = when (estado.fase) {
            FaseAlerta.FASE_1_AMARILLO -> "¿Estás bien?"
            FaseAlerta.FASE_2_NARANJA  -> "Se detectó anomalía"
            FaseAlerta.FASE_3_ROJO     -> "Llamando emergencias"
            else -> ""
        }

        Text(text = icono, fontSize = 28.sp)
        Spacer(Modifier.height(4.dp))
        Text(
            text = mensaje,
            color = Color.White,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "${estado.segundosRestantes}",
            color = Color.White,
            fontSize = 42.sp,
            fontWeight = FontWeight.ExtraBold
        )
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = onCancelar,
            modifier = Modifier.size(64.dp),
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(
                backgroundColor = Color.White.copy(alpha = 0.25f)
            )
        ) {
            Text(
                text = "✕ OK",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
fun PantallaCancelada() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("✅", fontSize = 32.sp)
        Spacer(Modifier.height(8.dp))
        Text(
            text = "Cancelado",
            color = Color.White,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
fun PantallaDisparada() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("🚑", fontSize = 32.sp)
        Spacer(Modifier.height(8.dp))
        Text(
            text = "Emergencia\nactivada",
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
    }
}


// ── Modelo de datos del sensor ────────────────────────────────────────────────

data class DatosSensor(
    val uid: String = "",
    val bpm: Int = 0,
    val spo2: Int = 0,
    val pasos: Int = 0,
    val movimiento: String = "inactivo",
    val tiempoSinMov: Int = 0,
    val caida: Boolean = false,
    val lat: Double = 0.0,   // en produccion: GPS del reloj
    val lon: Double = 0.0    // en produccion: GPS del reloj
)