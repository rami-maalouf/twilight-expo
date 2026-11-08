// android addition (the swift widget bundle has no overview widget): a 4x2
// home-screen summary of the dashboard. last night's sleep against the goal,
// the 7-night average pill, and the bedtime / wake targets. tapping opens
// twilight. values come pre-formatted from src/services/home-widget-snapshot.ts.
import { Box, Button, Column, Image, LinearProgressIndicator, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  fillMaxSize,
  fillMaxWidth,
  height,
  paddingAll,
  size,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import { initialHomeWidgetProps } from '../src/services/home-widget-snapshot';
import { SLEEP_OVERVIEW_WIDGET, type HomeWidgetProps } from './home-widget-props';

const SleepOverview = (props: HomeWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  // note: the 'widget' compiler captures only this function body - constants inline
  const GREEN = '#34c759';
  const SUN = '#ffbf00';
  const light = props.scheme === 'light' || (props.scheme === 'system' && environment.colorScheme === 'light');
  const c = light ? props.day : props.night;

  const minutes = Math.max(0, Math.floor((Date.now() - props.sessionStartMs) / 60000));
  const hours = Math.floor(minutes / 60);
  const elapsed = hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;

  return (
    <Box modifiers={[fillMaxSize()]}>
      <Image source={{ uri: c.sky }} contentScale="fillBounds" modifiers={[fillMaxSize()]} />
      {/* `target` is a widget-only button prop that ButtonProps does not type, hence the spread */}
      <Button {...{ target: 'open' }} colors={{ containerColor: 'transparent' }} modifiers={[fillMaxSize()]}>
        <Spacer modifiers={[fillMaxSize()]} />
      </Button>
      <Column modifiers={[fillMaxSize(), paddingAll(16)]}>
        <Box modifiers={[fillMaxWidth()]}>
          <Row verticalAlignment="center">
            <Image source={{ uri: 'twilight_widget_icon_moon' }} tint={c.moon} modifiers={[size(16, 16)]} />
            <Spacer modifiers={[width(6)]} />
            <Text color={c.textPrimary} style={{ fontSize: 13, fontWeight: 'bold' }} maxLines={1}>
              Twilight
            </Text>
          </Row>
          <Row modifiers={[fillMaxWidth()]} horizontalAlignment="end" verticalAlignment="center">
            {props.sleeping ? (
              <Text color={GREEN} style={{ fontSize: 12, fontWeight: 'bold' }} maxLines={1}>
                {`Sleeping · ${elapsed}`}
              </Text>
            ) : (
              <Text color={c.textSecondary} style={{ fontSize: 12 }} maxLines={1}>
                {`Goal ${props.goal}`}
              </Text>
            )}
          </Row>
        </Box>
        <Spacer modifiers={[height(12)]} />
        <Box modifiers={[fillMaxWidth()]}>
          <Column>
            <Text color={c.textSecondary} style={{ fontSize: 12 }} maxLines={1}>
              Last Night&apos;s Sleep
            </Text>
            <Text color={c.textPrimary} style={{ fontSize: 24, fontWeight: 'bold' }} maxLines={1}>
              {props.lastNight || 'Start tonight!'}
            </Text>
            <Spacer modifiers={[height(6)]} />
            <LinearProgressIndicator
              progress={props.lastNightProgress}
              color={c.accent}
              trackColor={c.track}
              modifiers={[width(132), height(6)]}
            />
            <Spacer modifiers={[height(4)]} />
            <Text color={c.textSecondary} style={{ fontSize: 11 }} maxLines={1}>
              {props.lastNightCaption}
            </Text>
          </Column>
          <Column modifiers={[fillMaxWidth()]} horizontalAlignment="end">
            <Text color={c.textSecondary} style={{ fontSize: 12 }} maxLines={1}>
              7-Night Average
            </Text>
            <Text color={c.textPrimary} style={{ fontSize: 24, fontWeight: 'bold' }} maxLines={1}>
              {props.average || '--'}
            </Text>
            <Spacer modifiers={[height(16)]} />
            <Text color={c.textSecondary} style={{ fontSize: 11 }} maxLines={1}>
              {props.averageCaption}
            </Text>
          </Column>
        </Box>
      </Column>
      <Column modifiers={[fillMaxSize(), paddingAll(16)]} verticalAlignment="bottom">
        <Box modifiers={[fillMaxWidth(), height(1), background(c.track)]} />
        <Spacer modifiers={[height(10)]} />
        <Box modifiers={[fillMaxWidth()]}>
          <Row verticalAlignment="center">
            <Image source={{ uri: 'twilight_widget_icon_moon' }} tint={light ? c.textSecondary : c.moon} modifiers={[size(14, 14)]} />
            <Spacer modifiers={[width(4)]} />
            <Text color={c.textPrimary} style={{ fontSize: 12 }} maxLines={1}>
              {`Bedtime ${props.bedtime}`}
            </Text>
          </Row>
          <Row modifiers={[fillMaxWidth()]} horizontalAlignment="end" verticalAlignment="center">
            <Image source={{ uri: 'twilight_widget_icon_sun' }} tint={light ? c.textSecondary : SUN} modifiers={[size(14, 14)]} />
            <Spacer modifiers={[width(4)]} />
            <Text color={c.textPrimary} style={{ fontSize: 12 }} maxLines={1}>
              {`Wake ${props.wake}`}
            </Text>
          </Row>
        </Box>
      </Column>
    </Box>
  );
};

export default createWidget(SLEEP_OVERVIEW_WIDGET, SleepOverview, initialHomeWidgetProps());
