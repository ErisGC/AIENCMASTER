import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'gem_palette.dart';

/// Tonalidad de la app: claro ("Nueva Jerusalén", por defecto) u oscuro.
///
/// La elección se guarda en el teléfono y se puede cambiar desde cualquier
/// pantalla, incluida la de bloqueo (botón de sol y luna).
class ThemeController extends ChangeNotifier {
  static const _kTheme = 'aienc_theme';

  ThemeMode _mode = ThemeMode.light;
  ThemeMode get mode => _mode;
  bool get isDark => _mode == ThemeMode.dark;

  /// Lee la elección guardada. Se llama antes de pintar la primera pantalla
  /// para que la app no arranque con una tonalidad y salte a la otra.
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _mode = prefs.getString(_kTheme) == 'dark'
          ? ThemeMode.dark
          : ThemeMode.light;
    } catch (_) {
      _mode = ThemeMode.light;
    }
    _apply();
  }

  Future<void> toggle() => setMode(isDark ? ThemeMode.light : ThemeMode.dark);

  Future<void> setMode(ThemeMode mode) async {
    if (mode == _mode) return;
    _mode = mode == ThemeMode.dark ? ThemeMode.dark : ThemeMode.light;
    _apply();
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kTheme, isDark ? 'dark' : 'light');
    } catch (_) {
      // Sin almacenamiento: la elección vale mientras la app siga abierta.
    }
  }

  void _apply() {
    final colors = isDark ? GemColors.dark : GemColors.light;
    GemPalette.use(colors);
    // Íconos de la barra de estado y de navegación acordes al fondo.
    SystemChrome.setSystemUIOverlayStyle(overlayStyleFor(colors));
  }

  /// Estilo de las barras del sistema para una tonalidad.
  static SystemUiOverlayStyle overlayStyleFor(GemColors colors) {
    final iconos = colors.isDark ? Brightness.light : Brightness.dark;
    return SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: iconos,
      statusBarBrightness: colors.isDark ? Brightness.dark : Brightness.light,
      systemNavigationBarColor: colors.background,
      systemNavigationBarIconBrightness: iconos,
    );
  }
}
