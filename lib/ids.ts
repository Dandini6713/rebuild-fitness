// A stable, client-generated identifier for a recorded set. It becomes the
// set_logs.client_operation_id value, whose unique constraint makes syncing the
// same set twice (after a reconnect or the app being backgrounded) a no-op rather
// than a duplicate. Generated once, when a set is first recorded locally.
//
// A UUID v4 string, so it is a valid value for the uuid column. React Native has
// no guaranteed crypto.randomUUID, so this uses a small Math.random-based v4
// generator; it does not need cryptographic strength, only uniqueness per device.

export function createOperationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
