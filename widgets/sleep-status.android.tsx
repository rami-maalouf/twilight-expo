// ports: TwilightWidget/Widgets/ProfileControlWidget.swift + Views/ProfileWidgetEntryView.swift
// (sleep-relevant parts) with the SleepModeControlWidget action as its primary
// button. 2x2 android home-screen widget.
// parity: "Gn" + moon header, green container with white text and a clock +
// elapsed time while a session runs, whole widget opens twilight.
// android: last night and the bedtime/wake targets replace the blocking-
// profile rows, the session start sits under the elapsed time, and a
// Start Sleep / Wake Up pill replaces "Tap to open".
// button targets are handled natively (modules/twilight-widget-actions):
// 'open' launches the app, 'sleep:start' / 'sleep:stop' open it with a
// pending action that the app runs like a twilight://sleep link.
import { Box, Button, Column, Image, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  height,
  paddingAll,
  size,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import { initialHomeWidgetProps } from '../src/services/home-widget-snapshot';
import { SLEEP_STATUS_WIDGET, type HomeWidgetProps } from './home-widget-props';

const SleepStatus = (props: HomeWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  // note: the 'widget' compiler captures only this function body - constants inline
  const WHITE = '#ffffff';
  const SUN = '#ffbf00';
  const light = props.scheme === 'light' || (props.scheme === 'system' && environment.colorScheme === 'light');
  const c = light ? props.day : props.night;
  const sleeping = props.sleeping;
  const primary = sleeping ? WHITE : c.textPrimary;
  const secondary = sleeping ? 'rgba(255, 255, 255, 0.8)' : c.textSecondary;

  const minutes = Math.max(0, Math.floor((Date.now() - props.sessionStartMs) / 60000));
  const hours = Math.floor(minutes / 60);
  const elapsed = hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;

  const row = (label: string, value: string) => (
    <Box modifiers={[fillMaxWidth()]}>
      <Text color={secondary} style={{ fontSize: 12 }} maxLines={1}>
        {label}
      </Text>
      <Row modifiers={[fillMaxWidth()]} horizontalAlignment="end">
        <Text color={primary} style={{ fontSize: 13, fontWeight: 'bold' }} maxLines={1}>
          {value}
        </Text>
      </Row>
    </Box>
  );

  return (
    <Box modifiers={[fillMaxSize()]}>
      <Image
        source={{ uri: sleeping ? 'twilight_widget_sky_active' : c.sky }}
        contentScale="fillBounds"
        modifiers={[fillMaxSize()]}
      />
      {/* `target` is a widget-only button prop that ButtonProps does not type, hence the spread */}
      <Button {...{ target: 'open' }} colors={{ containerColor: 'transparent' }} modifiers={[fillMaxSize()]}>
        <Spacer modifiers={[fillMaxSize()]} />
      </Button>
      <Column modifiers={[fillMaxSize(), paddingAll(14)]}>
        <Box modifiers={[fillMaxWidth()]}>
          <Text color={primary} style={{ fontSize: 14, fontWeight: 'bold' }} maxLines={1}>
            Gn
          </Text>
          <Row modifiers={[fillMaxWidth()]} horizontalAlignment="end">
            <Image
              source={{ uri: 'twilight_widget_icon_moon' }}
              tint={sleeping ? WHITE : c.moon}
              modifiers={[size(18, 18)]}
            />
          </Row>
        </Box>
        <Spacer modifiers={[height(10)]} />
        {sleeping ? (
          <Column modifiers={[fillMaxWidth()]}>
            <Row verticalAlignment="center">
              <Image source={{ uri: 'twilight_widget_icon_clock' }} tint={WHITE} modifiers={[size(18, 18)]} />
              <Spacer modifiers={[width(6)]} />
              <Text color={WHITE} style={{ fontSize: 22, fontWeight: 'bold' }} maxLines={1}>
                {elapsed}
              </Text>
            </Row>
            <Spacer modifiers={[height(6)]} />
            {row('Since', props.startedAt)}
            <Spacer modifiers={[height(4)]} />
            {row('Wake', props.wake)}
          </Column>
        ) : (
          <Column modifiers={[fillMaxWidth()]}>
            {row('Last night', props.lastNight || '--')}
            <Spacer modifiers={[height(4)]} />
            {row('Bedtime', props.bedtime)}
            <Spacer modifiers={[height(4)]} />
            {row('Wake', props.wake)}
          </Column>
        )}
      </Column>
      <Column modifiers={[fillMaxSize(), paddingAll(12)]} verticalAlignment="bottom">
        <Button
          {...{ target: sleeping ? 'sleep:stop' : 'sleep:start' }}
          colors={{ containerColor: sleeping ? 'rgba(255, 255, 255, 0.22)' : c.action }}
          modifiers={[fillMaxWidth(), height(40), cornerRadius(20)]}>
          <Row verticalAlignment="center">
            <Image
              source={{ uri: sleeping ? 'twilight_widget_icon_sun' : 'twilight_widget_icon_moon' }}
              tint={sleeping ? SUN : c.actionText}
              modifiers={[size(16, 16)]}
            />
            <Spacer modifiers={[width(6)]} />
            <Text color={sleeping ? WHITE : c.actionText} style={{ fontSize: 14, fontWeight: 'bold' }} maxLines={1}>
              {sleeping ? 'Wake Up' : 'Start Sleep'}
            </Text>
          </Row>
        </Button>
      </Column>
    </Box>
  );
};

export default createWidget(SLEEP_STATUS_WIDGET, SleepStatus, initialHomeWidgetProps());
