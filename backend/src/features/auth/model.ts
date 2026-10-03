export class InvalidOAuthStateError extends Error {
  constructor() {
    super('The OAuth state is unknown or has expired. Start the login again.');
    this.name = 'InvalidOAuthStateError';
  }
}
