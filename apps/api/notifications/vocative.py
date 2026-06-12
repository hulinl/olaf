"""Czech vocative form of personal names — pro oslovení v e-mailech.

User: "Když nám už uvádí jméno, jsme v Česku, tak používáme i české
skloňování." → "Ahoj Petr," → "Ahoj Petře,"

Vocative má v češtině poměrně pravidelná pravidla, ale pár ošemetných
výjimek (Pavel → Pavle, ne Pavele). Drží se:
1. **Override slovník** pro nepravidelná / cizí jména a běžné případy
   kde chceme být explicitní.
2. **Heuristika podle koncové slabiky** pro běžné koncovky (-r, -k, -š
   atd.).
3. Pokud si nevíme rady (např. cizí jméno, žádné pravidlo neaplikuje),
   vrátíme původní tvar — radši lehce nepřirozené než špatně skloněné.
"""
from __future__ import annotations

# Hardcoded forms pro běžná česká + slovenská jména, kde heuristika
# selhává nebo bychom chtěli mít explicitní jistotu. Klíče jsou
# v nominativu, case-sensitivně co do prvního písmene; matchneme
# capitalize() form.
_OVERRIDES_MASC: dict[str, str] = {
    # -el → drop -e- + -le (palatalizace)
    "Pavel": "Pavle",
    "Karel": "Karle",
    "Daniel": "Danieli",
    # -an → -ane
    "Roman": "Romane",
    "Štěpán": "Štěpáne",
    "Stanislav": "Stanislave",
    # -k → -ku, někdy drop -e
    "Marek": "Marku",
    "Mirek": "Mirku",
    "Vašek": "Vašku",
    "Patrik": "Patriku",
    "Dominik": "Dominiku",
    "Radek": "Radku",
    "Slávek": "Slávku",
    "Honzík": "Honzíku",
    "Erik": "Eriku",
    # -něk → palatalizace n → ň, drop -ě, -ku (Zdeněk → Zdeňku).
    # User report 2026-06-11: "Ahoj Zdeněku" → musí být "Ahoj Zdeňku".
    "Zdeněk": "Zdeňku",
    # -r po samohlásce → -e (NEpalatalizuje, ne jako Petr → Petře).
    "Vladimír": "Vladimíre",
    "Kazimír": "Kazimíre",
    "Lubomír": "Lubomíre",
    "Otakar": "Otakare",
    "Igor": "Igore",
    "Oldřich": "Oldřichu",
    "Bedřich": "Bedřichu",
    # Diminutiv končící na -a → female pattern -o
    "Standa": "Stando",
    "Sláva": "Slávo",
    # Soft consonants → -i
    "Tomáš": "Tomáši",
    "Lukáš": "Lukáši",
    "Aleš": "Aleši",
    # -r → -ře (palatalizace)
    "Petr": "Petře",
    # -í na konci → většinou unchanged (Jiří, Ondřej? ne, Ondřej je -ej)
    "Jiří": "Jiří",
    # Cizí nebo méně častá jména
    "George": "George",
    "Adam": "Adame",
    "Filip": "Filipe",
    "Jakub": "Jakube",
    "Michal": "Michale",
    "Jan": "Jane",
    "Honza": "Honzo",  # diminutiv kupodivu ženský -a → -o
    "Martin": "Martine",
    "David": "Davide",
    "Václav": "Václave",
    "Vojtěch": "Vojtěchu",
    "Matouš": "Matouši",
    "Matěj": "Matěji",
    "Ondřej": "Ondřeji",
    "Radim": "Radime",
    "Robert": "Roberte",
    "Richard": "Richarde",
    "Štefan": "Štefane",
    "Michael": "Michaele",
}

_OVERRIDES_FEM: dict[str, str] = {
    # -a → -o
    "Hana": "Hano",
    "Petra": "Petro",
    "Lenka": "Lenko",
    "Veronika": "Veroniko",
    "Tereza": "Terezo",
    "Kateřina": "Kateřino",
    "Klára": "Kláro",
    "Eliška": "Eliško",
    "Marie": "Marie",  # -ie unchanged
    "Lucie": "Lucie",
    "Anna": "Anno",
    "Jana": "Jano",
    "Eva": "Evo",
    "Martina": "Martino",
    "Olga": "Olgo",
    "Monika": "Moniko",
    "Andrea": "Andreo",
    "Alžběta": "Alžběto",
    "Karolína": "Karolíno",
    "Magdaléna": "Magdaléno",
}


_VOWELS = set("aeiouyáéíóúůýě")


def _heuristic_male(name: str) -> str:
    """Generic male vocative pravidla podle koncovky."""
    if not name:
        return name
    lower = name.lower()
    # Soft consonants → -i
    if lower.endswith(("š", "č", "ž", "j", "ť", "ď", "ň", "c")):
        return name + "i"
    # -něk pattern (Zdeněk, hypoteticky Doněk…) — drop -ěk, palatalizace
    # n → ň + -ku. Bez tohohle by heuristika dala Zdeněku, což je špatně.
    if lower.endswith("něk") and len(name) > 3:
        return name[:-3] + "ňku"
    # Velar -k/-g/-ch → -u (palatalizace by dala -če/-že, ale v moderní
    # češtině je -u standard). U -ek mužských jmen většinou drop -e-
    # (Marek → Marku, Mirek → Mirku) — ale to drží override slovník,
    # protože ne všechny -ek end-y to dělají (Erik → Eriku, ne Erku).
    if lower.endswith(("k", "g", "ch")):
        return name + "u"
    # -h → -hu (Vojtěch → Vojtěchu už v overrides, ale obecně)
    if lower.endswith("h"):
        return name + "u"
    # -r palatalizuje JEN po konsonantu (Petr → Petře, Bratr → Bratře).
    # Po samohlásce ne (Vladimír → Vladimíre, Otakar → Otakare, Igor →
    # Igore). Bez téhle distinction by heuristika dala chybně
    # "Vladimíře".
    if lower.endswith("r") and len(name) >= 2:
        prev = lower[-2]
        if prev in _VOWELS:
            return name + "e"
        return name[:-1] + "ře"
    # -l → -le
    if lower.endswith("l"):
        return name + "e"
    # Tvrdé/měkké konsonanty -d/-t/-n/-m/-b/-p/-v/-s/-z → -e
    if lower.endswith(("d", "t", "n", "m", "b", "p", "v", "s", "z", "f")):
        return name + "e"
    return name  # vowel-ending nebo nedohledaná koncovka → ponecháme


def _heuristic_female(name: str) -> str:
    """Generic female vocative pravidla podle koncovky."""
    if not name:
        return name
    lower = name.lower()
    # -ie ending → unchanged (Marie, Lucie)
    if lower.endswith("ie"):
        return name
    # -e ending → většinou unchanged (Adele atd.)
    if lower.endswith("e"):
        return name
    # -a → -o (Hana → Hano)
    if lower.endswith("a"):
        return name[:-1] + "o"
    # Konsonant-ending female jména jsou často -í (Maří, Mary) nebo
    # cizí — necháme.
    return name


def _looks_female(name: str) -> bool:
    """Heuristika: končí na -a/-e/-i? Pro češtinu poměrně dobré detekce.
    Existují mužská jména na -a (Honza, Sára-? ne to je ženské), takže
    overrides drží explicit list."""
    if not name:
        return False
    return name[-1].lower() in ("a", "e", "y", "i")


def to_czech_vocative(name: str) -> str:
    """Vrátí oslovovací (vokativ) tvar českého křestního jména.

    Pokud nelze určit pravidlo, vrátí původní tvar (radši nepřirozené
    "Ahoj Vladislav" než hloupé "Ahoj Vladislave-aaa").
    """
    if not name or not name.strip():
        return name
    # Capitalize first letter pro override lookup; zachováváme případně
    # smíšenou kapitalizaci.
    name = name.strip()
    capped = name[:1].upper() + name[1:].lower()
    if capped in _OVERRIDES_MASC:
        return _OVERRIDES_MASC[capped]
    if capped in _OVERRIDES_FEM:
        return _OVERRIDES_FEM[capped]
    if _looks_female(name):
        return _heuristic_female(name)
    return _heuristic_male(name)
