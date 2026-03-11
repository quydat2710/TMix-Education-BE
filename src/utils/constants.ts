// Regex: Minimal 8 chars, at least 1 letter, at least 1 number
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
export enum Actions {
    Manage = 'manage',
    Create = 'create',
    Read = 'read',
    Update = 'update',
    Delete = 'delete'
}