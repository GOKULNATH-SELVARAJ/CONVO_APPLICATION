// utils/colorGenerator.js

const takenColors = new Set(); // Assume this is filled from DB or elsewhere

const generateAlphabetColors = (variantsPerLetter = 10) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const step = 360 / alphabet.length;
  const colors = [];

  for (let i = 0; i < alphabet.length; i++) {
    const hue = Math.round(i * step);

    for (let j = 0; j < variantsPerLetter; j++) {
      const offset = j * 3; // slight hue offset for variants
      const variantHue = (hue + offset) % 360;

      const textColor = hslToHex(variantHue, 70, 30);
      const backgroundColor = hslToHex(variantHue, 70, 90);

      colors.push({
        letter: alphabet[i],
        textColor,
        backgroundColor,
        variant: j,
      });
    }
  }

  return colors;
};

const getAlphabetColor = (letter) => {
  const colors = generateAlphabetColors();

  for (const color of colors) {
    if (
      color.letter === letter.toUpperCase() &&
      !takenColors.has(color.backgroundColor)
    ) {
      takenColors.add(color.backgroundColor); // mark it as taken
      return color;
    }
  }

  // If all are taken, fallback: append a variant marker (alpha)
  const fallback = colors.find((c) => c.letter === letter.toUpperCase());
  return {
    ...fallback,
    backgroundColor: `${fallback.backgroundColor}AA`, // fallback color with transparency suffix
    fallback: true,
  };
};

const hslToHex = (h, s, l) => {
  s /= 100;
  l /= 100;

  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    Math.round(
      255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))
    );

  return `#${[f(0), f(8), f(4)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")}`;
};

module.exports = {
  generateAlphabetColors,
  getAlphabetColor,
};
