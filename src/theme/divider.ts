// list divider thickness. StyleSheet.hairlineWidth is one device pixel
// (0.38dp on a 2.625x pixel 9), and yoga's pixel rounding can collapse it to
// zero depending on where the row lands, so android dividers vanished at
// random. android uses material 3's 1dp divider; ios keeps the hairline of
// UITableView separators.
import { Platform, StyleSheet } from 'react-native';

export const DIVIDER_WIDTH = Platform.OS === 'android' ? 1 : StyleSheet.hairlineWidth;
