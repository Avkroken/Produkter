export class InvalidCredentials extends Error {
  constructor() { super("Fel e-postadress eller lösenord. Prova Glömt lösenord eller den inloggningsmetod du använde när du skapade kontot."); }
}
export class AuthRequestError extends Error {
  constructor(message: string, public readonly status: number = 400) { super(message); }
}
