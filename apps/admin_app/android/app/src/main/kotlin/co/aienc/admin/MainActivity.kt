package co.aienc.admin

import io.flutter.embedding.android.FlutterFragmentActivity

/**
 * FlutterFragmentActivity (y no FlutterActivity) es un REQUISITO de local_auth:
 * el diálogo biométrico de Android (BiometricPrompt) necesita un
 * FragmentActivity para poder mostrarse. Con FlutterActivity la huella falla.
 */
class MainActivity : FlutterFragmentActivity()
