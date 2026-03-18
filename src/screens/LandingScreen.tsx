import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Image,
} from 'react-native';

interface Props {
  onNavigateLogin: () => void;
  onNavigateRegister: () => void;
}

export default function LandingScreen({ onNavigateLogin, onNavigateRegister }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image source={require('../../assets/logo-biodash.png')} style={{ width: 100, height: 70 }} resizeMode="contain" />
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.loginButton} onPress={onNavigateLogin}>
            <Text style={styles.loginButtonText}>Entrar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.registerButton} onPress={onNavigateRegister}>
            <Text style={styles.registerButtonText}>Cadastre-se</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.webContainer}>
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Text style={styles.heroTitle}>Sistema de Gestão de Biodigestores</Text>
            <Text style={styles.heroSubtitle}>
              Monitore e otimize o desempenho do seu biodigestor com nosso dashboard completo e intuitivo.
            </Text>
            <Image
              source={require('../../assets/hero-banner.png')}
              style={styles.imagePlaceholderHero}
              resizeMode="cover"
            />
          </View>

          {/* Sobre o Projeto */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sobre o Projeto BioGen</Text>
            <Text style={styles.sectionText}>
              Uma solução sustentável para o tratamento de resíduos orgânicos, transformando-os em biogás por meio de biodigestores para a geração de energia elétrica limpa e biofertilizantes.
            </Text>
          </View>

          {/* ODS */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Objetivos de Desenvolvimento Sustentável</Text>
            <View style={styles.odsGrid}>
              <View style={styles.odsItem}><Text style={styles.odsText}>ODS 7</Text></View>
              <View style={styles.odsItem}><Text style={styles.odsText}>ODS 10</Text></View>
              <View style={styles.odsItem}><Text style={styles.odsText}>ODS 12</Text></View>
              <View style={styles.odsItem}><Text style={styles.odsText}>ODS 13</Text></View>
            </View>
          </View>

          {/* Diferenciais */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Nossos Diferenciais</Text>
            <View style={styles.featureCard}>
              <Text style={styles.featureTitle}>Rastreamento de Resíduos</Text>
              <Text style={styles.featureDesc}>Monitore a quantidade de resíduos processados em tempo real.</Text>
              <Image
                source={require('../../assets/residuos-banner.png')}
                style={styles.imagePlaceholderSmall}
                resizeMode="cover"
              />
            </View>
            <View style={styles.featureCard}>
              <Text style={styles.featureTitle}>Geração de Energia</Text>
              <Text style={styles.featureDesc}>Acompanhe a energia produzida pelo seu sistema com análises detalhadas.</Text>
              <Image
                source={require('../../assets/energia-banner.png')}
                style={styles.imagePlaceholderSmall}
                resizeMode="cover"
              />
            </View>
            <View style={styles.featureCard}>
              <Text style={styles.featureTitle}>Benefícios Fiscais</Text>
              <Text style={styles.featureDesc}>Calcule e visualize os benefícios fiscais da sua produção de energia sustentável.</Text>
              <Image
                source={require('../../assets/beneficio-banner.png')}
                style={styles.imagePlaceholderSmall}
                resizeMode="cover"
              />
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>©️ 2024 BioDash. Todos os direitos reservados.</Text>
            <View style={styles.footerLinks}>
              <TouchableOpacity><Text style={styles.footerLink}>Termos</Text></TouchableOpacity>
              <TouchableOpacity><Text style={styles.footerLink}>Privacidade</Text></TouchableOpacity>
              <TouchableOpacity><Text style={styles.footerLink}>Contato</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0fdf4',
    paddingTop: Platform.OS === 'android' ? 25 : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoEmoji: {
    fontSize: 24,
    marginRight: 6,
  },
  logoText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#14532d',
    letterSpacing: -0.5,
  },
  headerButtons: {
    flexDirection: 'row',
  },
  loginButton: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginRight: 4,
    borderRadius: 8,
  },
  loginButtonText: {
    color: '#16a34a',
    fontWeight: '600',
    fontSize: 14,
  },
  registerButton: {
    backgroundColor: '#16a34a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  registerButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  webContainer: {
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
    flex: 1,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#ffffff',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#14532d',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 34,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  imagePlaceholderHero: {
    width: '100%',
    height: 280,
    backgroundColor: '#e2e8f0',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  placeholderText: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 30,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#14532d',
    marginBottom: 16,
    textAlign: 'center',
  },
  sectionText: {
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
  },
  odsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  odsItem: {
    width: '48%',
    backgroundColor: '#bbf7d0',
    paddingVertical: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  odsText: {
    fontWeight: '700',
    color: '#166534',
    fontSize: 16,
  },
  featureCard: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#16a34a',
    marginBottom: 8,
  },
  featureDesc: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
    lineHeight: 20,
  },
  imagePlaceholderSmall: {
    width: '100%',
    height: 180,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: '#ffffff',
    marginTop: 20,
  },
  footerText: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 10,
  },
  footerLinks: {
    flexDirection: 'row',
    gap: 15,
  },
  footerLink: {
    fontSize: 13,
    color: '#16a34a',
    fontWeight: '500',
  },
});
