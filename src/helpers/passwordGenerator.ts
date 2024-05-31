export function passwordGenerator(length: number) {
  const charset =
    'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ2345678923456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}