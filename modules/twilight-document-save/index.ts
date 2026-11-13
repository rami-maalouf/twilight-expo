// typed access to the android-only TwilightDocumentSave native module: the
// storage access framework create-document picker for "save to device"
// (docs/health-connect.md 13). null on ios, on web and when the native code
// is not in the build; callers fall back to the share sheet.
import { requireOptionalNativeModule } from 'expo';

export interface SavedDocument {
  uri: string;
  displayName: string;
}

interface TwilightDocumentSaveNativeModule {
  // null when the user backs out of the picker
  saveTextDocument(fileName: string, mimeType: string, contents: string): Promise<SavedDocument | null>;
}

export default requireOptionalNativeModule<TwilightDocumentSaveNativeModule>('TwilightDocumentSave');
