const generateAlphabetColors = () => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const step = 360 / alphabet.length;
  const colors = [];

  for (let i = 0; i < alphabet.length; i++) {
    const hue = Math.round(i * step);
    const textColor = hslToHex(hue, 70, 30); // Dark text color
    const backgroundColor = hslToHex(hue, 70, 90); // Light background

    colors.push({
      letter: alphabet[i],
      textColor,
      backgroundColor,
    });
  }

  return colors;
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

const getAlphabetColor = (letter) => {
  const colors = generateAlphabetColors();
  return colors.find((c) => c.letter === letter.toUpperCase());
};

module.exports = {
  generateAlphabetColors,
  getAlphabetColor,
};
