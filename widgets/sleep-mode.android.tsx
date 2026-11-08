// ports: TwilightWidget/Widgets/SleepModeControlWidget.swift (ios 18 control).
// android has no control center, so this is a 2x1 home-screen toggle: label
// "Start Sleep" + moon (rgb 0,212,255) or "Wake Up" + sun (rgb 255,191,0),
// status "Off" / "On". tapping opens twilight to start or stop sleep
// (swift: ToggleSleepModeIntent, openAppWhenRun, action hint "Open Twilight").
import { Box, Button, Column, Image, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  cornerRadius,
  fillMaxSize,
  paddingAll,
  size,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import { initialHomeWidgetProps } from '../src/services/home-widget-snapshot';
import { SLEEP_MODE_WIDGET, type HomeWidgetProps } from './home-widget-props';

const SleepMode = (props: HomeWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  // note: the 'widget' compiler captures only this function body - constants inline
  const MOON = '#00d4ff';
  const SUN = '#ffbf00';
  const light = props.scheme === 'light' || (props.scheme === 'system' && environment.colorScheme === 'light');
  const c = light ? props.day : props.night;
  const on = props.sleeping;

  return (
    <Box modifiers={[fillMaxSize()]}>
      {/* the label crosses the star field at 2x1, so this widget uses the starless sky */}
      <Image source={{ uri: `${c.sky}_plain` }} contentScale="fillBounds" modifiers={[fillMaxSize()]} />
      {/* `target` is a widget-only button prop that ButtonProps does not type, hence the spread */}
      <Button
        {...{ target: on ? 'sleep:stop' : 'sleep:start' }}
        colors={{ containerColor: 'transparent' }}
        modifiers={[fillMaxSize()]}>
        <Row modifiers={[fillMaxSize(), paddingAll(12)]} verticalAlignment="center">
          <Box
            contentAlignment="center"
            modifiers={[size(40, 40), cornerRadius(20), background(on ? 'rgba(255, 191, 0, 0.22)' : c.halo)]}>
            <Image
              source={{ uri: on ? 'twilight_widget_icon_sun' : 'twilight_widget_icon_moon' }}
              tint={on ? SUN : MOON}
              contentDescription={null}
              modifiers={[size(22, 22)]}
            />
          </Box>
          <Spacer modifiers={[width(12)]} />
          <Column>
            <Text color={c.textPrimary} style={{ fontSize: 15, fontWeight: 'bold' }} maxLines={1}>
              {on ? 'Wake Up' : 'Start Sleep'}
            </Text>
            <Text color={c.textSecondary} style={{ fontSize: 12 }} maxLines={1}>
              {on ? 'On' : 'Off'}
            </Text>
          </Column>
        </Row>
      </Button>
    </Box>
  );
};

export default createWidget(SLEEP_MODE_WIDGET, SleepMode, initialHomeWidgetProps());
