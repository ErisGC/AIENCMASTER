import 'package:flutter/material.dart';

/// Colores de una tonalidad completa de la app.
///
/// Hay dos, igual que en la web (`apps/web/app/globals.css`):
///
///  - [GemColors.light], "Nueva Jerusalén" (Apocalipsis 21 y 22): fondos de
///    perla y cristal, azul de cielo, el verde agua del río de vida y oro
///    "semejante al vidrio limpio". Es la tonalidad por defecto.
///  - [GemColors.dark], "Firmamento": la paleta de gemas sobre azul noche que
///    la app tuvo desde el principio.
///
/// Los colores de texto y de botones del modo claro están medidos para
/// contraste AA sobre sus fondos.
@immutable
class GemColors {
  const GemColors({
    required this.brightness,
    required this.sapphire,
    required this.emerald,
    required this.topaz,
    required this.topazText,
    required this.amethyst,
    required this.ruby,
    required this.background,
    required this.surface,
    required this.surfaceElevated,
    required this.borderSoft,
    required this.chip,
    required this.textPrimary,
    required this.textMuted,
    required this.danger,
    required this.primaryGradientColors,
    required this.surfaceGradientColors,
    required this.welcomeGlow,
    required this.shadow,
    required this.snackBackground,
    required this.snackText,
  });

  final Brightness brightness;

  final Color sapphire;
  final Color emerald;
  final Color topaz;

  /// Oro cuando va como texto (el decorativo no alcanza contraste en claro).
  final Color topazText;
  final Color amethyst;
  final Color ruby;

  final Color background;
  final Color surface;
  final Color surfaceElevated;
  final Color borderSoft;
  final Color chip;
  final Color textPrimary;
  final Color textMuted;
  final Color danger;

  final List<Color> primaryGradientColors;
  final List<Color> surfaceGradientColors;

  /// Luz del fondo de bienvenida y bloqueo (centro, borde).
  final List<Color> welcomeGlow;

  /// Sombra de tarjetas y botones.
  final Color shadow;

  final Color snackBackground;
  final Color snackText;

  bool get isDark => brightness == Brightness.dark;

  /// Modo claro: Nueva Jerusalén.
  static const light = GemColors(
    brightness: Brightness.light,
    sapphire: Color(0xFF2A6BB5),
    emerald: Color(0xFF0E7C70),
    topaz: Color(0xFFCDA349),
    topazText: Color(0xFF8A6512),
    amethyst: Color(0xFF7656AE),
    ruby: Color(0xFFB23A54),
    background: Color(0xFFF3F7FC),
    surface: Color(0xFFFFFFFF),
    surfaceElevated: Color(0xFFFFFFFF),
    borderSoft: Color(0x2E2A6BB5), // zafiro al 18 %
    chip: Color(0x142A6BB5), // zafiro al 8 %
    textPrimary: Color(0xFF172A46),
    textMuted: Color(0xFF57657B),
    danger: Color(0xFFB23A54),
    // Sin el dorado al final: el texto blanco encima pierde contraste.
    primaryGradientColors: [
      Color(0xFF2A6BB5),
      Color(0xFF1E78A6),
      Color(0xFF0E7C70),
    ],
    surfaceGradientColors: [Color(0xFFFFFFFF), Color(0xFFF6F9FE)],
    welcomeGlow: [Color(0xFFFFF4D6), Color(0xFFE6F0FB), Color(0xFFF3F7FC)],
    shadow: Color(0x1A2A528C),
    snackBackground: Color(0xFF1C2E4A),
    snackText: Color(0xFFFFFFFF),
  );

  /// Modo oscuro: Firmamento (la tonalidad original de la app).
  static const dark = GemColors(
    brightness: Brightness.dark,
    sapphire: Color(0xFF0F4C81),
    emerald: Color(0xFF0F7B6C),
    topaz: Color(0xFFD4A437),
    topazText: Color(0xFFE8C46B),
    amethyst: Color(0xFF7B3F99),
    ruby: Color(0xFFB0274D),
    background: Color(0xFF0B1220),
    surface: Color(0xFF111B2E),
    surfaceElevated: Color(0xFF18253D),
    borderSoft: Color(0x33FFFFFF),
    chip: Color(0x14FFFFFF),
    textPrimary: Color(0xFFEFF4FB),
    textMuted: Color(0xFFB7C2D0),
    danger: Color(0xFFE05656),
    primaryGradientColors: [
      Color(0xFF0F4C81),
      Color(0xFF0F7B6C),
      Color(0xFFD4A437),
    ],
    surfaceGradientColors: [Color(0xFF13203A), Color(0xFF0E1729)],
    welcomeGlow: [Color(0xFF18253D), Color(0xFF0B1220), Color(0xFF0B1220)],
    shadow: Color(0x33000000),
    snackBackground: Color(0xFF18253D),
    snackText: Color(0xFFEFF4FB),
  );
}

/// Paleta de gemas usada en todo el panel AIENC (web + app).
///
/// Los nombres son los de siempre, pero ahora devuelven el color de la
/// tonalidad activa ([ThemeController] la cambia con [use]). Por eso ya no
/// son constantes: un widget que los usa se vuelve a pintar cuando la app
/// reconstruye su árbol al cambiar de tonalidad.
class GemPalette {
  GemPalette._();

  static GemColors _c = GemColors.light;

  /// Tonalidad activa.
  static GemColors get current => _c;

  /// Cambia la tonalidad activa. Lo llama [ThemeController].
  static void use(GemColors colors) => _c = colors;

  static Color get sapphire => _c.sapphire;
  static Color get emerald => _c.emerald;
  static Color get topaz => _c.topaz;
  static Color get topazText => _c.topazText;
  static Color get amethyst => _c.amethyst;
  static Color get ruby => _c.ruby;

  // Tonos suaves para fondos / chips (16 % de opacidad).
  static Color get sapphireWeak => _c.sapphire.withValues(alpha: 0.16);
  static Color get emeraldWeak => _c.emerald.withValues(alpha: 0.16);
  static Color get topazWeak => _c.topaz.withValues(alpha: 0.16);
  static Color get amethystWeak => _c.amethyst.withValues(alpha: 0.16);
  static Color get rubyWeak => _c.ruby.withValues(alpha: 0.16);

  static Color get background => _c.background;
  static Color get surface => _c.surface;
  static Color get surfaceElevated => _c.surfaceElevated;
  static Color get borderSoft => _c.borderSoft;
  static Color get chip => _c.chip;

  static Color get textPrimary => _c.textPrimary;
  static Color get textMuted => _c.textMuted;
  static Color get danger => _c.danger;
  static Color get shadow => _c.shadow;

  /// Texto e íconos sobre rellenos de color (botones, insignias).
  static const Color onAccent = Colors.white;

  /// Gradiente principal usado en botones primarios y headers.
  static LinearGradient get primaryGradient => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: _c.primaryGradientColors,
    stops: const [0.0, 0.55, 1.0],
  );

  static LinearGradient get sapphireEmeraldGradient => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [_c.sapphire, _c.emerald],
  );

  static LinearGradient get surfaceGradient => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: _c.surfaceGradientColors,
  );

  /// Fondo de bienvenida y bloqueo: luz suave arriba (oro y cielo en claro).
  static RadialGradient get welcomeGradient => RadialGradient(
    center: const Alignment(0, -1.1),
    radius: 1.35,
    colors: _c.welcomeGlow,
    stops: const [0.0, 0.55, 1.0],
  );
}
