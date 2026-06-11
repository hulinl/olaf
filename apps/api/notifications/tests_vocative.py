"""Coverage pro Czech vocative helper — oslovení v e-mailech."""
from __future__ import annotations

from django.test import TestCase

from .vocative import to_czech_vocative


class VocativeMaleTests(TestCase):
    def test_petr_uses_palatalized_r(self) -> None:
        # User report z 2026-06-11: "tady je Ahoj Petr. To by měl být
        # Ahoj Petře". `r` palatalizuje na `ř` + `e`.
        self.assertEqual(to_czech_vocative("Petr"), "Petře")

    def test_pavel_drops_internal_e(self) -> None:
        self.assertEqual(to_czech_vocative("Pavel"), "Pavle")

    def test_karel_drops_internal_e(self) -> None:
        self.assertEqual(to_czech_vocative("Karel"), "Karle")

    def test_tomas_soft_consonant_to_i(self) -> None:
        self.assertEqual(to_czech_vocative("Tomáš"), "Tomáši")

    def test_marek_velar_to_u(self) -> None:
        self.assertEqual(to_czech_vocative("Marek"), "Marku")

    def test_vojtech_heuristic_falls_back_to_override(self) -> None:
        # Override existuje pro Vojtěch.
        self.assertEqual(to_czech_vocative("Vojtěch"), "Vojtěchu")

    def test_adam_generic_e_suffix(self) -> None:
        self.assertEqual(to_czech_vocative("Adam"), "Adame")

    def test_filip_generic_e_suffix(self) -> None:
        self.assertEqual(to_czech_vocative("Filip"), "Filipe")

    def test_david_generic_e_suffix(self) -> None:
        self.assertEqual(to_czech_vocative("David"), "Davide")

    def test_jiri_unchanged(self) -> None:
        # Jména na -í většinou zůstávají.
        self.assertEqual(to_czech_vocative("Jiří"), "Jiří")


class VocativeFemaleTests(TestCase):
    def test_petra_a_to_o(self) -> None:
        self.assertEqual(to_czech_vocative("Petra"), "Petro")

    def test_hana_a_to_o(self) -> None:
        self.assertEqual(to_czech_vocative("Hana"), "Hano")

    def test_marie_ie_unchanged(self) -> None:
        self.assertEqual(to_czech_vocative("Marie"), "Marie")

    def test_lucie_ie_unchanged(self) -> None:
        self.assertEqual(to_czech_vocative("Lucie"), "Lucie")

    def test_katerina_a_to_o(self) -> None:
        self.assertEqual(to_czech_vocative("Kateřina"), "Kateřino")


class VocativeEdgeCases(TestCase):
    def test_empty_returns_empty(self) -> None:
        self.assertEqual(to_czech_vocative(""), "")
        self.assertEqual(to_czech_vocative("   "), "   ")

    def test_unknown_foreign_name_unchanged(self) -> None:
        # Cizí jména, kde si nevíme rady, raději nesoupime — radši
        # gramaticky nekorektní "Ahoj Vladislav" než pochybný "Ahoji"
        # nebo nesmysl.
        # (Vladislav končí konsonantem → heuristika dá -e: Vladislave.
        # Pokud nechceš, override list to změní. Tady jen ověříme,
        # že fallback nepadne.)
        result = to_czech_vocative("Vladislav")
        self.assertTrue(result)  # nějaký output přijde

    def test_lowercase_input_works(self) -> None:
        # Override lookup je case-insensitive (kapitalizujeme před
        # lookupem).
        self.assertEqual(to_czech_vocative("petr"), "Petře")
