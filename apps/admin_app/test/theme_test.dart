import 'package:admin_app/core/theme/gem_palette.dart';
import 'package:admin_app/core/theme/theme_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Contraste WCAG entre dos colores opacos.
double contraste(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final claro = la > lb ? la : lb;
  final oscuro = la > lb ? lb : la;
  return (claro + 0.05) / (oscuro + 0.05);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'arranca en modo claro y alterna a oscuro guardando la elección',
    () async {
      SharedPreferences.setMockInitialValues({});
      final c = ThemeController();
      await c.load();
      expect(c.isDark, isFalse);
      expect(GemPalette.current.brightness, Brightness.light);

      await c.toggle();
      expect(c.isDark, isTrue);
      expect(GemPalette.background, GemColors.dark.background);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('aienc_theme'), 'dark');

      await c.toggle();
      expect(GemPalette.background, GemColors.light.background);
    },
  );

  test('respeta la tonalidad guardada al arrancar', () async {
    SharedPreferences.setMockInitialValues({'aienc_theme': 'dark'});
    final c = ThemeController();
    await c.load();
    expect(c.isDark, isTrue);
    expect(GemPalette.current.isDark, isTrue);
  });

  test('el modo claro se lee bien (contraste AA)', () {
    const l = GemColors.light;
    for (final fondo in [l.background, l.surface]) {
      expect(contraste(l.textPrimary, fondo), greaterThanOrEqualTo(4.5));
      expect(contraste(l.textMuted, fondo), greaterThanOrEqualTo(4.5));
      expect(contraste(l.sapphire, fondo), greaterThanOrEqualTo(4.5));
      expect(contraste(l.danger, fondo), greaterThanOrEqualTo(4.5));
      expect(contraste(l.topazText, fondo), greaterThanOrEqualTo(4.5));
    }
    // Texto blanco sobre los rellenos de botones e insignias.
    for (final relleno in [
      l.sapphire,
      l.emerald,
      l.ruby,
      ...l.primaryGradientColors,
    ]) {
      expect(contraste(Colors.white, relleno), greaterThanOrEqualTo(4.5));
    }
  });
}
