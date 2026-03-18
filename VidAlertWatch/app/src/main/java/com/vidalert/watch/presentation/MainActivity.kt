package com.vidalert.watch.presentation

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.*
import com.vidalert.watch.presentation.theme.VidAlertWatchTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setTheme(android.R.style.Theme_DeviceDefault)

        setContent {
            VidAlertWatchTheme {
                PantallaSimulacion(
                    onLanzarAlerta = {
                        val intent = Intent(this, AlertaEscaladaActivity::class.java).apply {
                            // Cambia estos valores para simular distintos escenarios
                            putExtra("uid",                   "y93JP3Fp4AhFPF2tbcIpSubexYO2")
                            putExtra("bpm",                   145)
                            putExtra("spo2",                  92)
                            putExtra("pasos",                 3)
                            putExtra("movimiento",            "inactivo")
                            putExtra("tiempo_sin_movimiento", 15)
                            putExtra("caida_detectada",       false)
                            putExtra("lat",                   42.0169)  // GPS del reloj
                            putExtra("lon",                   -4.5234)  // GPS del reloj
                        }
                        startActivity(intent)
                    }
                )
            }
        }
    }
}

@Composable
fun PantallaSimulacion(onLanzarAlerta: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF1A1A2E)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = "VidAlert",
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Watch",
                color = Color(0xFF64B5F6),
                fontSize = 13.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = onLanzarAlerta,
                modifier = Modifier.size(72.dp),
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(
                    backgroundColor = Color(0xFFB71C1C)
                )
            ) {
                Text(
                    text = "TEST\nALERTA",
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}