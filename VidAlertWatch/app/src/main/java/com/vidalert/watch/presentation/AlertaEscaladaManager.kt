package com.vidalert.watch.presentation

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import kotlinx.coroutines.*

enum class FaseAlerta { NINGUNA, FASE_1_AMARILLO, FASE_2_NARANJA, FASE_3_ROJO, DISPARADA, CANCELADA }

data class EstadoAlerta(
    val fase: FaseAlerta = FaseAlerta.NINGUNA,
    val segundosRestantes: Int = 90,
    val cancelada: Boolean = false
)

class AlertaEscaladaManager(private val context: Context) {

    private var job: Job? = null
    private var onEstadoCambia: ((EstadoAlerta) -> Unit)? = null
    private var onDisparar: (() -> Unit)? = null

    private val vibrator: Vibrator by lazy {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }

    private val soundPool: SoundPool by lazy {
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        SoundPool.Builder().setMaxStreams(1).setAudioAttributes(attrs).build()
    }
    private var soundId: Int = 0

    // ← soundResId viene de la Activity, que sí tiene acceso a R.raw
    fun iniciar(
        soundResId: Int,
        onEstadoCambia: (EstadoAlerta) -> Unit,
        onDisparar: () -> Unit
    ) {
        this.onEstadoCambia = onEstadoCambia
        this.onDisparar = onDisparar
        soundId = soundPool.load(context, soundResId, 1)

        job = CoroutineScope(Dispatchers.Main).launch {
            var segundos = 90

            while (segundos > 0) {
                val fase = when {
                    segundos > 60 -> FaseAlerta.FASE_1_AMARILLO
                    segundos > 30 -> FaseAlerta.FASE_2_NARANJA
                    else          -> FaseAlerta.FASE_3_ROJO
                }

                val esInicioFase = segundos == 90 || segundos == 60 || segundos == 30
                if (esInicioFase) vibrar(fase)

                onEstadoCambia(EstadoAlerta(fase = fase, segundosRestantes = segundos))
                delay(1000L)
                segundos--
            }

            onEstadoCambia(EstadoAlerta(fase = FaseAlerta.DISPARADA, segundosRestantes = 0))
            detenerSonido()
            onDisparar()
        }
    }

    fun cancelar() {
        job?.cancel()
        vibrator.cancel()
        detenerSonido()
        onEstadoCambia?.invoke(EstadoAlerta(fase = FaseAlerta.CANCELADA, cancelada = true))
    }

    private fun vibrar(fase: FaseAlerta) {
        vibrator.cancel()
        val efecto = when (fase) {
            FaseAlerta.FASE_1_AMARILLO -> VibrationEffect.createWaveform(
                longArrayOf(0, 300, 400, 300),
                intArrayOf(0, 80, 0, 80),
                0
            )
            FaseAlerta.FASE_2_NARANJA -> VibrationEffect.createWaveform(
                longArrayOf(0, 500, 200, 500),
                intArrayOf(0, 200, 0, 200),
                0
            )
            FaseAlerta.FASE_3_ROJO -> {
                soundPool.play(soundId, 1f, 1f, 1, -1, 1f)
                VibrationEffect.createWaveform(
                    longArrayOf(0, 700, 100, 700),
                    intArrayOf(0, 255, 0, 255),
                    0
                )
            }
            else -> return
        }
        vibrator.vibrate(efecto)
    }

    private fun detenerSonido() {
        soundPool.autoPause()
    }
}